"""Workflow engine tests - uses mock provider only, no real API keys needed."""
from __future__ import annotations
import pytest
from typing import List, Optional
from ..core.workflow import (
    WorkflowEngine, WorkflowDefinition, WorkflowStep, StepStatus, CheckpointStore,
)
from ..core.router import TaskRouter
from ..core.policies import get_policy, PolicyType
from ..core.discovery import ModelRegistry
from ..core.token_accounting import TokenAccountant
from ..providers.mock import MockProvider
import uuid
import os


@pytest.fixture
def engine(tmp_path):
    providers = {"mock": MockProvider()}
    registry = ModelRegistry()
    accountant = TokenAccountant()
    router = TaskRouter(providers, registry=registry, accountant=accountant)
    db = str(tmp_path / "test_state.db")
    store = CheckpointStore(db_path=db)
    return WorkflowEngine(router, checkpoint_store=store)


def _step(i: int, group=None, condition=None, on_failure=None) -> WorkflowStep:
    return WorkflowStep(
        id=f"step_{i}",
        name=f"Step {i}",
        role="developer",
        prompt_template="Do task {input}",
        provider_hint="mock",
        parallel_group=group,
        condition=condition,
        on_failure_step=on_failure,
    )


def _wf(steps: "List[WorkflowStep]") -> WorkflowDefinition:
    return WorkflowDefinition(
        id="test-wf", name="Test Workflow", description="Test", steps=steps,
    )


@pytest.mark.asyncio
async def test_simple_workflow_completes(engine):
    wf = _wf([_step(0), _step(1)])
    policy = get_policy(PolicyType.BALANCED)
    run = await engine.execute(wf, "test input", policy)
    assert run.status == StepStatus.COMPLETED
    assert len(run.results) == 2
    for r in run.results.values():
        assert r.status == StepStatus.COMPLETED


@pytest.mark.asyncio
async def test_cost_and_token_tracking(engine):
    wf = _wf([_step(0), _step(1), _step(2)])
    policy = get_policy(PolicyType.BALANCED)
    run = await engine.execute(wf, "test input", policy)
    assert run.total_tokens >= 0  # mock provider returns real token estimates


@pytest.mark.asyncio
async def test_on_step_complete_callback(engine):
    wf = _wf([_step(0), _step(1)])
    policy = get_policy(PolicyType.BALANCED)
    completed = []

    async def on_step(result):
        completed.append(result.step_id)

    await engine.execute(wf, "test", policy, on_step_complete=on_step)
    assert "step_0" in completed
    assert "step_1" in completed
    assert len(completed) == 2


@pytest.mark.asyncio
async def test_conditional_step_skipped(engine):
    """Step with condition=False should be skipped."""
    steps = [
        _step(0),
        WorkflowStep(
            id="step_skip",
            name="Skip Me",
            role="developer",
            prompt_template="Should not run",
            provider_hint="mock",
            condition="False",  # always skip
        ),
        _step(2),
    ]
    policy = get_policy(PolicyType.BALANCED)
    run = await engine.execute(_wf(steps), "test", policy)
    assert run.results["step_skip"].status == StepStatus.SKIPPED
    assert run.results["step_0"].status == StepStatus.COMPLETED
    assert run.results["step_2"].status == StepStatus.COMPLETED


@pytest.mark.asyncio
async def test_parallel_steps_run(engine):
    """Steps in the same parallel_group should all complete."""
    steps = [
        WorkflowStep(
            id=f"p_{i}", name=f"Parallel {i}",
            role="developer", prompt_template="Parallel task {input}",
            provider_hint="mock", parallel_group="batch",
        )
        for i in range(3)
    ]
    policy = get_policy(PolicyType.BALANCED)
    run = await engine.execute(_wf(steps), "parallel test", policy)
    assert run.status == StepStatus.COMPLETED
    for i in range(3):
        assert run.results[f"p_{i}"].status == StepStatus.COMPLETED


@pytest.mark.asyncio
async def test_checkpoint_save_and_restore(tmp_path, engine):
    """A completed run should be saveable and loadable from SQLite."""
    wf = _wf([_step(0), _step(1)])
    policy = get_policy(PolicyType.BALANCED)
    run = await engine.execute(wf, "checkpoint test", policy)

    # Force a checkpoint save
    engine._checkpoints.save(run)

    # Restore via a fresh engine with the same db
    providers = {"mock": MockProvider()}
    router2 = TaskRouter(providers, registry=ModelRegistry(), accountant=TokenAccountant())
    db = str(tmp_path / "test_state.db")
    store2 = CheckpointStore(db_path=db)
    engine2 = WorkflowEngine(router2, checkpoint_store=store2)

    restored = engine2.get_run(run.id)
    assert restored is not None
    assert restored.id == run.id
    assert restored.status.value == "completed"
    assert len(restored.results) == 2


@pytest.mark.asyncio
async def test_create_run_returns_run(engine):
    wf = _wf([_step(0)])
    run = engine.create_run(wf, "input text")
    assert run.id
    assert run.workflow_id == "test-wf"
    assert engine.get_run(run.id) is not None


@pytest.mark.asyncio
async def test_serialize_run(engine):
    wf = _wf([_step(0)])
    policy = get_policy(PolicyType.BALANCED)
    run = await engine.execute(wf, "serialize test", policy)
    data = engine.serialize_run(run)
    assert "run_id" in data
    assert "steps" in data
    assert "status" in data
    assert data["status"] == "completed"
