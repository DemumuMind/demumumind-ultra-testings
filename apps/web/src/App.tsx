import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState
} from "react";
import type {
  CcsStatus,
  PipelineProgress,
  WorkspaceArtifactKind,
  WorkspaceArtifactPreview,
  WorkflowDetail,
  WorkspaceDetail,
  WorkflowSummary,
  WorkspaceSummary
} from "@shannon/shared";
import { AppShell } from "./app-shell.js";
import {
  connectOpenAiWithCcs,
  getCcsStatus,
  getProviders,
  getRuntimeHealth,
  getWorkspace,
  getWorkspaceArtifactDownloadUrl,
  getWorkspaceArtifactPreview,
  startWorkflow,
  stopWorkflow,
  getWorkflow,
  getWorkflowProgress,
  getWorkflows,
  getWorkspaces,
  startCcsDashboard,
  stopCcsDashboard,
  stopRuntime,
  type ProviderResponse
} from "./api.js";
import {
  buildLaunchInput,
  buildResumeDraft,
  createEmptyLaunchDraft,
  type LaunchDraft
} from "./workflow-launch.js";
import { shouldPollWorkflow } from "./workflow-progress.js";

const DEFAULT_USER_ID = "local-cli-user";

export function App() {
  const [ccsStatus, setCcsStatus] = useState<CcsStatus | null>(null);
  const [ccsActionPending, setCcsActionPending] = useState<
    "connect" | "start-dashboard" | "stop-dashboard" | null
  >(null);
  const [runtimeHealthy, setRuntimeHealthy] = useState(false);
  const [runtimeStopping, setRuntimeStopping] = useState(false);
  const [providers, setProviders] = useState<ProviderResponse[]>([]);
  const [launchDraft, setLaunchDraft] = useState<LaunchDraft>(createEmptyLaunchDraft);
  const [launchingWorkflow, setLaunchingWorkflow] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [stoppingWorkflowId, setStoppingWorkflowId] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [workspaceDetail, setWorkspaceDetail] = useState<WorkspaceDetail | null>(null);
  const [artifactPreviewLoading, setArtifactPreviewLoading] = useState(false);
  const [artifactPreviewError, setArtifactPreviewError] = useState<string | null>(null);
  const [artifactPreview, setArtifactPreview] = useState<WorkspaceArtifactPreview | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [workflowDetail, setWorkflowDetail] = useState<WorkflowDetail | null>(null);
  const [workflowProgress, setWorkflowProgress] = useState<PipelineProgress | null>(null);

  const deferredSelectedWorkflowId = useDeferredValue(selectedWorkflowId);

  const refreshDashboard = useEffectEvent(async () => {
    const [nextCcsStatus, runtimeHealth, providerList, workflowList, workspaceList] =
      await Promise.all([
        getCcsStatus(),
        getRuntimeHealth(),
        getProviders(),
        getWorkflows(),
        getWorkspaces()
      ]);

    startTransition(() => {
      setCcsStatus(nextCcsStatus);
      setRuntimeHealthy(runtimeHealth.healthy);
      setProviders(providerList);
      setWorkflows(workflowList);
      setWorkspaces(workspaceList);
      setSelectedWorkspaceId((current) => current ?? workspaceList[0]?.id ?? null);
      setSelectedWorkflowId((current) => current ?? workflowList[0]?.id ?? null);
    });
  });

  const loadWorkflowDetail = useEffectEvent(async (workflowId: string) => {
    const detail = await getWorkflow(workflowId);

    startTransition(() => {
      setWorkflowDetail(detail);
    });
  });

  const loadWorkflowProgress = useEffectEvent(async (workflowId: string) => {
    try {
      const progress = await getWorkflowProgress(workflowId);

      startTransition(() => {
        setWorkflowProgress(progress);
      });
    } catch {
      startTransition(() => {
        setWorkflowProgress(null);
      });
    }
  });

  const loadWorkspaceDetail = useEffectEvent(async (workspaceId: string) => {
    const detail = await getWorkspace(workspaceId);

    startTransition(() => {
      setWorkspaceDetail(detail);
    });
  });

  const runCcsAction = useEffectEvent(
    async (
      action: "connect" | "start-dashboard" | "stop-dashboard",
      operation: () => Promise<CcsStatus>
    ) => {
      startTransition(() => {
        setCcsActionPending(action);
      });

      try {
        const nextStatus = await operation();

        startTransition(() => {
          setCcsStatus(nextStatus);
        });

        await refreshDashboard();
      } finally {
        startTransition(() => {
          setCcsActionPending(null);
        });
      }
    }
  );

  const handleStopRuntime = useEffectEvent(async () => {
    startTransition(() => {
      setRuntimeStopping(true);
    });

    try {
      await stopRuntime({
        clean: false
      });
      await refreshDashboard();
    } finally {
      startTransition(() => {
        setRuntimeStopping(false);
      });
    }
  });

  const handleRefresh = useEffectEvent(async () => {
    await refreshDashboard();

    if (deferredSelectedWorkflowId) {
      await loadWorkflowDetail(deferredSelectedWorkflowId);
      await loadWorkflowProgress(deferredSelectedWorkflowId);
    }
  });

  const runWorkflowLaunch = useEffectEvent(async (draft: LaunchDraft) => {
    startTransition(() => {
      setLaunchingWorkflow(true);
      setLaunchError(null);
    });

    try {
      const started = await startWorkflow(
        buildLaunchInput({
          userId: DEFAULT_USER_ID,
          draft
        })
      );

      startTransition(() => {
        setSelectedWorkflowId(started.id);
        setSelectedWorkspaceId(started.workspace);
        setLaunchDraft((current) => ({
          ...current,
          workspace: started.workspace
        }));
      });

      await refreshDashboard();
      await loadWorkspaceDetail(started.workspace);
      await loadWorkflowDetail(started.id);
      await loadWorkflowProgress(started.id);
    } catch (error) {
      startTransition(() => {
        setLaunchError((error as Error).message);
      });
    } finally {
      startTransition(() => {
        setLaunchingWorkflow(false);
      });
    }
  });

  const handleLaunchWorkflow = useEffectEvent(async () => {
    await runWorkflowLaunch(launchDraft);
  });

  const handleResumeWorkspace = useEffectEvent(async (workspace: WorkspaceSummary) => {
    const draft = buildResumeDraft(workspace);

    startTransition(() => {
      setLaunchDraft((current) => ({
        ...current,
        ...draft
      }));
    });

    await runWorkflowLaunch(draft);
  });

  const handleLaunchDraftChange = useEffectEvent((field: keyof LaunchDraft, value: string) => {
    startTransition(() => {
      setLaunchDraft((current) => ({
        ...current,
        [field]: value
      }));
    });
  });

  const handleSelectWorkflow = useEffectEvent((workflowId: string) => {
    const workflow = workflows.find((item) => item.id === workflowId);

    startTransition(() => {
      setSelectedWorkflowId(workflowId);
      if (workflow) {
        setSelectedWorkspaceId(workflow.workspace);
      }
    });
  });

  const handleSelectWorkspace = useEffectEvent((workspaceId: string) => {
    startTransition(() => {
      setSelectedWorkspaceId(workspaceId);
    });
  });

  const handlePreviewArtifact = useEffectEvent(
    async (workspaceId: string, artifactKind: WorkspaceArtifactKind) => {
      startTransition(() => {
        setArtifactPreviewLoading(true);
        setArtifactPreviewError(null);
      });

      try {
        const preview = await getWorkspaceArtifactPreview(workspaceId, artifactKind);

        startTransition(() => {
          setArtifactPreview(preview);
        });
      } catch (error) {
        startTransition(() => {
          setArtifactPreview(null);
          setArtifactPreviewError((error as Error).message);
        });
      } finally {
        startTransition(() => {
          setArtifactPreviewLoading(false);
        });
      }
    }
  );

  const handleDownloadArtifact = useEffectEvent(
    (workspaceId: string, artifactKind: WorkspaceArtifactKind) => {
      if (typeof window === "undefined") {
        return;
      }

      window.open(getWorkspaceArtifactDownloadUrl(workspaceId, artifactKind), "_blank", "noopener");
    }
  );

  const handleStopWorkflow = useEffectEvent(async (workflowId: string) => {
    startTransition(() => {
      setStoppingWorkflowId(workflowId);
    });

    try {
      const stopped = await stopWorkflow(workflowId);

      startTransition(() => {
        setSelectedWorkflowId(stopped.id);
        setSelectedWorkspaceId(stopped.workspace);
      });

      await refreshDashboard();
      await loadWorkspaceDetail(stopped.workspace);
      await loadWorkflowDetail(stopped.id);
      await loadWorkflowProgress(stopped.id);
    } finally {
      startTransition(() => {
        setStoppingWorkflowId(null);
      });
    }
  });

  const handleConnectOpenAi = useEffectEvent(async () => {
    await runCcsAction("connect", () => connectOpenAiWithCcs());
  });

  const handleStartCcsDashboard = useEffectEvent(async () => {
    await runCcsAction("start-dashboard", () => startCcsDashboard());
  });

  const handleStopCcsDashboard = useEffectEvent(async () => {
    await runCcsAction("stop-dashboard", () => stopCcsDashboard());
  });

  useEffect(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  useEffect(() => {
    if (!deferredSelectedWorkflowId) {
      setWorkflowDetail(null);
      setWorkflowProgress(null);
      return;
    }

    void loadWorkflowDetail(deferredSelectedWorkflowId);
    void loadWorkflowProgress(deferredSelectedWorkflowId);
  }, [deferredSelectedWorkflowId, loadWorkflowDetail, loadWorkflowProgress]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setWorkspaceDetail(null);
      setArtifactPreview(null);
      setArtifactPreviewError(null);
      setArtifactPreviewLoading(false);
      return;
    }

    setArtifactPreview(null);
    setArtifactPreviewError(null);
    setArtifactPreviewLoading(false);
    void loadWorkspaceDetail(selectedWorkspaceId);
  }, [loadWorkspaceDetail, selectedWorkspaceId]);

  useEffect(() => {
    if (!deferredSelectedWorkflowId) {
      return;
    }

    const selectedWorkflow =
      workflows.find((workflow) => workflow.id === deferredSelectedWorkflowId) ?? null;

    if (
      !shouldPollWorkflow({
        workflowDetail,
        workflowSummary: selectedWorkflow,
        workflowProgress
      })
    ) {
      return;
    }

    const timer = setInterval(() => {
      void refreshDashboard();
      void loadWorkflowDetail(deferredSelectedWorkflowId);
      void loadWorkflowProgress(deferredSelectedWorkflowId);
    }, 5000);

    return () => {
      clearInterval(timer);
    };
  }, [
    deferredSelectedWorkflowId,
    loadWorkflowDetail,
    loadWorkflowProgress,
    refreshDashboard,
    workflowDetail,
    workflowProgress,
    workflows
  ]);

  useEffect(() => {
    if (
      !ccsStatus ||
      (ccsStatus.activeProcess !== "starting" && ccsStatus.activeProcess !== "running")
    ) {
      return;
    }

    const timer = setInterval(() => {
      void refreshDashboard();
    }, 3000);

    return () => {
      clearInterval(timer);
    };
  }, [ccsStatus, refreshDashboard]);

  return (
    <AppShell
      state={{
        ccsStatus,
        ccsActionPending,
        runtimeHealthy,
        runtimeStopping,
        pollingActive: shouldPollWorkflow({
          workflowDetail,
          workflowSummary:
            workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null,
          workflowProgress
        }),
        providers,
        launchDraft,
        launchingWorkflow,
        launchError,
        stoppingWorkflowId,
        workflows,
        workspaces,
        selectedWorkspaceId,
        workspaceDetail,
        artifactPreviewLoading,
        artifactPreviewError,
        artifactPreview,
        selectedWorkflowId,
        workflowProgress,
        workflowDetail
      }}
      onRefresh={() => {
        void handleRefresh();
      }}
      onStopRuntime={() => {
        void handleStopRuntime();
      }}
      onConnectOpenAi={() => {
        void handleConnectOpenAi();
      }}
      onStartCcsDashboard={() => {
        void handleStartCcsDashboard();
      }}
      onStopCcsDashboard={() => {
        void handleStopCcsDashboard();
      }}
      onLaunchDraftChange={(field, value) => {
        handleLaunchDraftChange(field, value);
      }}
      onLaunchWorkflow={() => {
        void handleLaunchWorkflow();
      }}
      onResumeWorkspace={(workspace) => {
        void handleResumeWorkspace(workspace);
      }}
      onSelectWorkflow={(workflowId) => {
        handleSelectWorkflow(workflowId);
      }}
      onStopWorkflow={(workflowId) => {
        void handleStopWorkflow(workflowId);
      }}
      onSelectWorkspace={(workspaceId) => {
        handleSelectWorkspace(workspaceId);
      }}
      onPreviewArtifact={(workspaceId, artifactKind) => {
        void handlePreviewArtifact(workspaceId, artifactKind);
      }}
      onDownloadArtifact={(workspaceId, artifactKind) => {
        handleDownloadArtifact(workspaceId, artifactKind);
      }}
    />
  );
}
