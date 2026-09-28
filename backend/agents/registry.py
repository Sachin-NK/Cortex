from __future__ import annotations
"""
Agent Marketplace Registry - built-in agents + user-installed agents.
Each agent is a named WorkflowDefinition with pre-built steps.
"""
import re
from typing import Optional, List
from ..core.workflow import WorkflowDefinition, WorkflowStep


def _step(name: str, role: str, prompt: str, provider: Optional[str] = None, approval: bool = False) -> WorkflowStep:
    # Use a stable, deterministic ID derived from the step name so checkpointed
    # runs can correlate step results across restarts (uuid4 at import = new IDs each time)
    stable_id = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return WorkflowStep(
        id=stable_id, name=name, role=role,
        prompt_template=prompt, provider_hint=provider,
        requires_approval=approval,
    )


BUILTIN_AGENTS: dict[str, WorkflowDefinition] = {
    "code_reviewer": WorkflowDefinition(
        id="code_reviewer", name="Code Reviewer", description="Reviews code for quality, bugs and security",
        tags=["code", "quality"],
        steps=[
            _step("Understand", "code analyst", "Summarize what this code does:\n{input}", provider="gemini"),
            _step("Bug Scan", "security engineer", "Find bugs and vulnerabilities in:\n{input}\n\nContext: {context}", provider="anthropic"),
            _step("Report", "technical writer", "Write a code review report based on these findings:\n{context}", provider="openai"),
        ],
    ),
    "rest_api_builder": WorkflowDefinition(
        id="rest_api_builder", name="REST API Builder", description="Designs and implements a REST API end-to-end",
        tags=["code", "api", "backend"],
        steps=[
            _step("Architect", "software architect", "Design the API structure, endpoints and data models for:\n{input}", provider="gemini"),
            _step("Implement", "backend developer", "Write the full implementation based on this design:\n{context}", provider="deepseek"),
            _step("Review", "code reviewer", "Review this implementation for quality and security:\n{context}", provider="openai", approval=True),
            _step("Security", "security engineer", "Audit this code for security vulnerabilities:\n{context}", provider="anthropic"),
            _step("Document", "technical writer", "Write API documentation for:\n{context}", provider="kimi"),
        ],
    ),
    "research_agent": WorkflowDefinition(
        id="research_agent", name="Research Agent", description="Deep research on any topic with structured report",
        tags=["research", "analysis"],
        steps=[
            _step("Plan", "research planner", "Break down this research topic into key questions:\n{input}", provider="gemini"),
            _step("Analyze", "researcher", "Research and analyze each question thoroughly:\n{context}", provider="openai"),
            _step("Synthesize", "analyst", "Synthesize findings into key insights:\n{context}", provider="anthropic"),
            _step("Report", "technical writer", "Write a comprehensive research report:\n{context}", provider="kimi"),
        ],
    ),
    "security_agent": WorkflowDefinition(
        id="security_agent", name="Security Agent", description="Full security audit of code or architecture",
        tags=["security", "code"],
        steps=[
            _step("Threat Model", "security architect", "Create a threat model for:\n{input}", provider="anthropic"),
            _step("Vulnerability Scan", "penetration tester", "Identify vulnerabilities based on:\n{context}", provider="anthropic"),
            _step("Risk Assessment", "security analyst", "Assess risk levels for each finding:\n{context}", provider="openai"),
            _step("Remediation", "security engineer", "Provide remediation steps for all findings:\n{context}", provider="deepseek"),
        ],
    ),
    "devops_agent": WorkflowDefinition(
        id="devops_agent", name="DevOps Agent", description="CI/CD pipeline, Docker, Kubernetes configs",
        tags=["devops", "infrastructure"],
        steps=[
            _step("Analyze", "devops engineer", "Analyze the project structure and requirements:\n{input}", provider="gemini"),
            _step("Dockerfile", "container specialist", "Write Dockerfile and docker-compose for:\n{context}", provider="deepseek"),
            _step("CI/CD", "devops engineer", "Write GitHub Actions CI/CD pipeline for:\n{context}", provider="deepseek"),
            _step("K8s", "kubernetes engineer", "Write Kubernetes manifests for:\n{context}", provider="openai"),
            _step("Review", "senior devops", "Review and finalize all configs:\n{context}", provider="anthropic", approval=True),
        ],
    ),
    "data_analyst": WorkflowDefinition(
        id="data_analyst", name="Data Analyst", description="Analyze data, generate insights and visualizations",
        tags=["data", "analysis"],
        steps=[
            _step("Understand", "data engineer", "Understand the data structure and schema:\n{input}", provider="gemini"),
            _step("Analyze", "data scientist", "Perform statistical analysis on:\n{context}", provider="openai"),
            _step("Insights", "business analyst", "Extract key business insights from:\n{context}", provider="anthropic"),
            _step("Report", "data reporter", "Generate a data analysis report:\n{context}", provider="kimi"),
        ],
    ),
    "resume_writer": WorkflowDefinition(
        id="resume_writer", name="Resume Writer", description="Professional resume tailored to job descriptions",
        tags=["writing", "career"],
        steps=[
            _step("Parse", "career counselor", "Extract key skills and experience from:\n{input}", provider="gemini"),
            _step("Match", "recruiter", "Match skills to target role requirements:\n{context}", provider="openai"),
            _step("Draft", "resume writer", "Write a compelling resume based on:\n{context}", provider="anthropic"),
            _step("Polish", "editor", "Polish and refine the resume:\n{context}", provider="openai"),
        ],
    ),
    "debugger": WorkflowDefinition(
        id="debugger", name="Debugger", description="Systematic debugging and root cause analysis",
        tags=["code", "debug"],
        steps=[
            _step("Reproduce", "qa engineer", "Analyze the bug report and identify reproduction steps:\n{input}", provider="gemini"),
            _step("Root Cause", "senior developer", "Find the root cause of this bug:\n{context}", provider="anthropic"),
            _step("Fix", "developer", "Write the fix for:\n{context}", provider="deepseek"),
            _step("Test", "qa engineer", "Write tests that verify the fix:\n{context}", provider="deepseek"),
        ],
    ),
    "test_generator": WorkflowDefinition(
        id="test_generator", name="Test Generator", description="Generate comprehensive unit and integration tests",
        tags=["code", "testing"],
        steps=[
            _step("Analyse", "code analyst", "Understand the code under test and identify coverage gaps:\n{input}", provider="gemini"),
            _step("Unit Tests", "test engineer", "Write thorough unit tests for:\n{context}", provider="deepseek"),
            _step("Edge Cases", "qa engineer", "Add edge-case and boundary tests for:\n{context}", provider="openai"),
            _step("Review", "senior developer", "Review and improve test quality:\n{context}", provider="anthropic"),
        ],
    ),
}


class AgentRegistry:
    def __init__(self):
        self._agents: dict[str, WorkflowDefinition] = dict(BUILTIN_AGENTS)

    def list_agents(self, tag: Optional[str] = None) -> List[WorkflowDefinition]:
        agents = list(self._agents.values())
        if tag:
            agents = [a for a in agents if tag in a.tags]
        return agents

    def get_agent(self, agent_id: str) -> WorkflowDefinition | None:
        return self._agents.get(agent_id)

    def install_agent(self, agent: WorkflowDefinition) -> None:
        self._agents[agent.id] = agent

    def uninstall_agent(self, agent_id: str) -> bool:
        if agent_id in self._agents and agent_id not in BUILTIN_AGENTS:
            del self._agents[agent_id]
            return True
        if agent_id in BUILTIN_AGENTS:
            return False  # built-in agents cannot be removed
        return False
