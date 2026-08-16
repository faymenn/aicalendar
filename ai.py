from pathlib import Path
import re
from typing import List
from uuid import uuid4
from datetime import datetime

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import START, MessagesState, StateGraph

from app.schema import LoopOutput

load_dotenv()

prompt = (Path(__file__).resolve().parent / "prompt.md").read_text(encoding="utf-8")

model = ChatOpenAI(model="gpt-5.5", use_responses_api=True, output_version="responses/v1")
checkpointer = InMemorySaver()


class AgentState(MessagesState):
    end_loop: bool
    assistant_message: str
    structured_tasks: List[dict]
    timezone: str


loop_model = model.with_structured_output(LoopOutput)


def as_naive_wallclock(value: datetime | None) -> datetime | None:
    """Keep the clock time the model produced; drop timezone labels like Z/UTC."""
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.replace(tzinfo=None)
    return value


def normalize_task_datetimes(task: dict) -> dict:
    normalized = dict(task)
    for field in ("start_time", "end_time", "deadline", "completed_at"):
        raw = normalized.get(field)
        if not raw:
            continue
        if isinstance(raw, datetime):
            naive = as_naive_wallclock(raw)
            normalized[field] = naive.isoformat(timespec="seconds") if naive else None
            continue
        if isinstance(raw, str):
            match = re.match(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})", raw)
            normalized[field] = match.group(1) if match else raw
    return normalized


def call_model(state: AgentState):
    timezone = state.get("timezone") or "local"
    system_prompt = (
        f"{prompt}\n\n"
        f"User timezone: {timezone}.\n"
        "All times the user mentions are wall-clock times in that timezone.\n"
        "When outputting start_time/end_time/deadline, use naive local datetimes "
        "(YYYY-MM-DDTHH:MM:SS) with no Z and no UTC offset.\n"
        "Example: if the user says 4:30 PM, output 16:30:00 in the date string, not UTC.\n"
        "Output fields:\n"
        "- end_loop: true only when all required information is present.\n"
        "- assistant_message: clarifying question when end_loop is false.\n"
        "- tasks: list of TaskCreate items. Keep empty when end_loop is false.\n"
        "Do not invent unknown fields."
    )
    messages = [("system", system_prompt)] + state["messages"]
    response = loop_model.invoke(messages)
    tasks = [
        normalize_task_datetimes(task.model_dump(mode="json"))
        for task in response.tasks
    ]
    if response.end_loop and not tasks:
        repair_messages = messages + [
            (
                "system",
                "Your last output was invalid: end_loop was true but tasks was empty. "
                "Fix it now: either set end_loop to false with a clarifying assistant_message, "
                "or keep end_loop true and return a non-empty tasks list. "
                "Keep all datetimes as naive local wall-clock values with no Z/offset.",
            )
        ]
        response = loop_model.invoke(repair_messages)
        tasks = [
            normalize_task_datetimes(task.model_dump(mode="json"))
            for task in response.tasks
        ]
    return {
        "end_loop": response.end_loop,
        "assistant_message": response.assistant_message,
        "structured_tasks": tasks,
    }


builder = StateGraph(AgentState)
builder.add_node("call_model", call_model)
builder.add_edge(START, "call_model")
agent = builder.compile(checkpointer=checkpointer)


def run_agent(
    message: str,
    thread_id: str | None = None,
    timezone: str | None = None,
) -> dict:
    thread_id = thread_id or str(uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    result = agent.invoke(
        {
            "messages": [("user", message)],
            "timezone": timezone or "local",
        },
        config=config,
    )
    return {
        "thread_id": thread_id,
        "end_loop": result.get("end_loop", False),
        "assistant_message": result.get("assistant_message", ""),
        "structured_tasks": result.get("structured_tasks", []),
    }


if __name__ == "__main__":
    cli_thread_id = "cli-thread"
    user_input = input("Enter: ").strip()
    while user_input != "exit":
        result = run_agent(user_input, thread_id=cli_thread_id)
        if result.get("end_loop"):
            print(f"\nStructured tasks:\n{result.get('structured_tasks', [])}")
        else:
            print(f"\nAI: {result.get('assistant_message', '')}")
        user_input = input("Enter: ").strip()
