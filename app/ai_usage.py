from datetime import date, datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from . import model
from .util import settings


def _daily_status(db: Session, user: model.User) -> dict:
    limit = settings.AI_DAILY_REQUEST_LIMIT
    today = date.today()
    usage = (
        db.query(model.AiUsageDaily)
        .filter(
            model.AiUsageDaily.user_id == user.id,
            model.AiUsageDaily.usage_date == today,
        )
        .first()
    )
    used = usage.request_count if usage else 0
    return {
        "limit": limit,
        "used": used,
        "remaining": max(limit - used, 0),
    }


def _chat_status(db: Session, user: model.User, thread_id: str | None) -> dict:
    limit = settings.AI_CHAT_REPLY_LIMIT
    if not thread_id:
        return {
            "chat_limit": limit,
            "chat_used": 0,
            "chat_remaining": limit,
        }

    usage = (
        db.query(model.AiChatUsage)
        .filter(
            model.AiChatUsage.user_id == user.id,
            model.AiChatUsage.thread_id == thread_id,
        )
        .first()
    )
    used = usage.request_count if usage else 0
    return {
        "chat_limit": limit,
        "chat_used": used,
        "chat_remaining": max(limit - used, 0),
    }


def get_ai_usage_status(
    db: Session,
    user: model.User,
    thread_id: str | None = None,
) -> dict:
    email = (user.email or "").strip().lower()
    unlimited = email in settings.ai_unlimited_emails
    daily = _daily_status(db, user)
    chat = _chat_status(db, user, thread_id)

    if unlimited:
        return {
            "unlimited": True,
            "limit": daily["limit"],
            "used": 0,
            "remaining": None,
            "chat_limit": chat["chat_limit"],
            "chat_used": 0,
            "chat_remaining": None,
            "enabled": settings.AI_ENABLED,
        }

    return {
        "unlimited": False,
        "limit": daily["limit"],
        "used": daily["used"],
        "remaining": daily["remaining"],
        "chat_limit": chat["chat_limit"],
        "chat_used": chat["chat_used"],
        "chat_remaining": chat["chat_remaining"],
        "enabled": settings.AI_ENABLED,
    }


def _increment_daily_new_chat(db: Session, user: model.User) -> dict:
    today = date.today()
    usage = (
        db.query(model.AiUsageDaily)
        .filter(
            model.AiUsageDaily.user_id == user.id,
            model.AiUsageDaily.usage_date == today,
        )
        .first()
    )
    if usage is None:
        usage = model.AiUsageDaily(
            user_id=user.id,
            usage_date=today,
            request_count=0,
        )
        db.add(usage)
        db.flush()

    if usage.request_count >= settings.AI_DAILY_REQUEST_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Daily new AI chat limit reached ({settings.AI_DAILY_REQUEST_LIMIT}). "
                "You can keep replying in an existing chat, or try again tomorrow."
            ),
        )

    usage.request_count += 1
    usage.updated_at = datetime.now()
    db.commit()
    used = usage.request_count
    return {
        "limit": settings.AI_DAILY_REQUEST_LIMIT,
        "used": used,
        "remaining": max(settings.AI_DAILY_REQUEST_LIMIT - used, 0),
    }


def _increment_chat_reply(db: Session, user: model.User, thread_id: str) -> dict:
    usage = (
        db.query(model.AiChatUsage)
        .filter(
            model.AiChatUsage.user_id == user.id,
            model.AiChatUsage.thread_id == thread_id,
        )
        .first()
    )
    if usage is None:
        usage = model.AiChatUsage(
            user_id=user.id,
            thread_id=thread_id,
            request_count=0,
        )
        db.add(usage)
        db.flush()

    if usage.request_count >= settings.AI_CHAT_REPLY_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"This chat reached its limit ({settings.AI_CHAT_REPLY_LIMIT} messages). "
                "Start a new chat to continue."
            ),
        )

    usage.request_count += 1
    usage.updated_at = datetime.now()
    db.commit()
    used = usage.request_count
    return {
        "chat_limit": settings.AI_CHAT_REPLY_LIMIT,
        "chat_used": used,
        "chat_remaining": max(settings.AI_CHAT_REPLY_LIMIT - used, 0),
    }


def enforce_ai_usage_limit(
    db: Session,
    user: model.User,
    thread_id: str | None = None,
) -> dict:
    if not settings.AI_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI mode is temporarily disabled.",
        )

    email = (user.email or "").strip().lower()
    if email in settings.ai_unlimited_emails:
        return get_ai_usage_status(db, user, thread_id)

    # New chat (no thread yet) counts against the daily new-query quota.
    if not thread_id:
        daily = _increment_daily_new_chat(db, user)
        return {
            "unlimited": False,
            "limit": daily["limit"],
            "used": daily["used"],
            "remaining": daily["remaining"],
            "chat_limit": settings.AI_CHAT_REPLY_LIMIT,
            "chat_used": 0,
            "chat_remaining": settings.AI_CHAT_REPLY_LIMIT,
            "enabled": True,
            "is_new_chat": True,
        }

    # Follow-up in an existing chat counts against the per-chat reply quota.
    chat = _increment_chat_reply(db, user, thread_id)
    daily = _daily_status(db, user)
    return {
        "unlimited": False,
        "limit": daily["limit"],
        "used": daily["used"],
        "remaining": daily["remaining"],
        "chat_limit": chat["chat_limit"],
        "chat_used": chat["chat_used"],
        "chat_remaining": chat["chat_remaining"],
        "enabled": True,
        "is_new_chat": False,
    }


def record_new_chat_first_message(
    db: Session,
    user: model.User,
    thread_id: str,
) -> dict:
    """After a new chat's first response, seed the per-chat counter at 1."""
    email = (user.email or "").strip().lower()
    if email in settings.ai_unlimited_emails:
        return get_ai_usage_status(db, user, thread_id)

    usage = (
        db.query(model.AiChatUsage)
        .filter(
            model.AiChatUsage.user_id == user.id,
            model.AiChatUsage.thread_id == thread_id,
        )
        .first()
    )
    if usage is None:
        usage = model.AiChatUsage(
            user_id=user.id,
            thread_id=thread_id,
            request_count=1,
        )
        db.add(usage)
    elif usage.request_count < 1:
        usage.request_count = 1
    usage.updated_at = datetime.now()
    db.commit()

    daily = _daily_status(db, user)
    return {
        "unlimited": False,
        "limit": daily["limit"],
        "used": daily["used"],
        "remaining": daily["remaining"],
        "chat_limit": settings.AI_CHAT_REPLY_LIMIT,
        "chat_used": usage.request_count,
        "chat_remaining": max(settings.AI_CHAT_REPLY_LIMIT - usage.request_count, 0),
        "enabled": True,
    }
