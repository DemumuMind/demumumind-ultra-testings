import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState
} from "react";
import type { WorkflowDetail, WorkflowSummary, WorkspaceSummary } from "@shannon/shared";
import { AppShell } from "./app-shell.js";
import { getAuthStatus, getProviders, getWorkflow, getWorkflows, getWorkspaces, type ProviderResponse } from "./api.js";

const DEFAULT_USER_ID = "local-cli-user";

export function App() {
  const [authState, setAuthState] = useState<"connected" | "pending" | "disconnected">(
    "disconnected"
  );
  const [connectionEmail, setConnectionEmail] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderResponse[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [workflowDetail, setWorkflowDetail] = useState<WorkflowDetail | null>(null);

  const deferredSelectedWorkflowId = useDeferredValue(selectedWorkflowId);

  const refreshDashboard = useEffectEvent(async () => {
    const [authStatus, providerList, workflowList, workspaceList] = await Promise.all([
      getAuthStatus(DEFAULT_USER_ID),
      getProviders(),
      getWorkflows(),
      getWorkspaces()
    ]);

    startTransition(() => {
      setAuthState(authStatus.connected ? "connected" : "disconnected");
      setConnectionEmail(authStatus.profile?.email ?? null);
      setProviders(providerList);
      setWorkflows(workflowList);
      setWorkspaces(workspaceList);
      setSelectedWorkflowId((current) => current ?? workflowList[0]?.id ?? null);
    });
  });

  const loadWorkflowDetail = useEffectEvent(async (workflowId: string) => {
    const detail = await getWorkflow(workflowId);

    startTransition(() => {
      setWorkflowDetail(detail);
    });
  });

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  useEffect(() => {
    if (!deferredSelectedWorkflowId) {
      setWorkflowDetail(null);
      return;
    }

    void loadWorkflowDetail(deferredSelectedWorkflowId);
  }, [deferredSelectedWorkflowId, loadWorkflowDetail]);

  return (
    <AppShell
      state={{
        authState,
        connectionEmail,
        providers,
        workflows,
        workspaces,
        selectedWorkflowId,
        workflowDetail
      }}
    />
  );
}
