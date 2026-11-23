const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export async function ensureDemoSession(): Promise<{
  token: string;
  workspaceId: string;
  workspaceName: string;
  userName: string;
  email: string;
}> {
  const existingToken = window.sessionStorage.getItem("devscope_session_token");
  const existingWorkspace = window.sessionStorage.getItem("devscope_workspace_id");
  if (existingToken && existingWorkspace) {
    return {
      token: existingToken,
      workspaceId: existingWorkspace,
      workspaceName: window.sessionStorage.getItem("devscope_workspace_name") ?? "DevScope workspace",
      userName: window.sessionStorage.getItem("devscope_user_name") ?? "Demo user",
      email: window.sessionStorage.getItem("devscope_user_email") ?? "",
    };
  }

  const response = await fetch(`${apiUrl}/auth/demo/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? "Unable to create a DevScope demo session");
  }
  const result = await response.json() as {
    token: string;
    workspaceId: string;
    workspaceName: string;
    user: { name: string; email: string };
  };
  window.sessionStorage.setItem("devscope_session_token", result.token);
  window.sessionStorage.setItem("devscope_workspace_id", result.workspaceId);
  window.sessionStorage.setItem("devscope_workspace_name", result.workspaceName);
  window.sessionStorage.setItem("devscope_user_name", result.user.name);
  window.sessionStorage.setItem("devscope_user_email", result.user.email);
  return {
    token: result.token,
    workspaceId: result.workspaceId,
    workspaceName: result.workspaceName,
    userName: result.user.name,
    email: result.user.email,
  };
}
