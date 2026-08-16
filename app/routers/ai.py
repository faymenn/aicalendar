from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import model, schema
from ..ai_usage import (
    enforce_ai_usage_limit,
    get_ai_usage_status,
    record_new_chat_first_message,
)
from ..database import get_db
from ..routers.auth import get_current_user

router = APIRouter(prefix="/ai", tags=["ai"])


def _run_agent(message: str, thread_id: str | None = None, timezone: str | None = None):
    from ai import run_agent

    return run_agent(message, thread_id=thread_id, timezone=timezone)


def _is_out_of_credits_error(error: Exception) -> bool:
    text = str(error).lower()
    markers = (
        "insufficient_quota",
        "exceeded your current quota",
        "billing_not_active",
        "you exceeded your current quota",
        "quota exceeded",
        "insufficient credits",
        "credit balance is too low",
    )
    return any(marker in text for marker in markers)


@router.get("/usage", response_model=schema.AIUsageStatus)
def ai_usage_status(
    thread_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: model.User = Depends(get_current_user),
):
    return schema.AIUsageStatus(**get_ai_usage_status(db, current_user, thread_id))


@router.post("/tasks", status_code=status.HTTP_200_OK, response_model=schema.AITaskResponse)
def ai_plan_tasks(
    payload: schema.AITaskRequest,
    db: Session = Depends(get_db),
    current_user: model.User = Depends(get_current_user),
):
    is_new_chat = not payload.thread_id
    usage = enforce_ai_usage_limit(db, current_user, payload.thread_id)

    try:
        result = _run_agent(
            payload.message,
            thread_id=payload.thread_id,
            timezone=payload.timezone,
        )
    except Exception as error:
        if _is_out_of_credits_error(error):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI is out of credits right now. Please try again later.",
            ) from error
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI request failed. Please try again.",
        ) from error

    if is_new_chat:
        usage = record_new_chat_first_message(db, current_user, result["thread_id"])

    proposed_tasks = []
    if result.get("end_loop"):
        for task_data in result.get("structured_tasks", []):
            proposed_tasks.append(schema.TaskCreate.model_validate(task_data))

    return schema.AITaskResponse(
        end_loop=bool(result.get("end_loop")),
        assistant_message=result.get("assistant_message", ""),
        thread_id=result["thread_id"],
        proposed_tasks=proposed_tasks,
        unlimited=usage["unlimited"],
        limit=usage["limit"],
        used=usage["used"],
        remaining=usage["remaining"],
        chat_limit=usage["chat_limit"],
        chat_used=usage["chat_used"],
        chat_remaining=usage["chat_remaining"],
    )
