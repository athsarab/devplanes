const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export async function bootstrapSupabaseSession(accessToken: string) {
  const response = await fetch(`${apiUrl}/auth/session/bootstrap`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? "Unable to initialize your DevScope workspace");
  }
  const result = await response.json() as {
    token: string;
    workspaceId: string;
    workspaceName: string;
    user: { name: string; email: string };
  };
  window.sessionStorage.setItem("devscope_session_token", accessToken);
  window.sessionStorage.setItem("devscope_workspace_id", result.workspaceId);
  window.sessionStorage.setItem("devscope_workspace_name", result.workspaceName);
  window.sessionStorage.setItem("devscope_user_name", result.user.name);
  window.sessionStorage.setItem("devscope_user_email", result.user.email);
  return result;
}

export async function ensureDemoSession(): Promise<{
  token: string;
  workspaceId: string;
  workspaceName: string;
  userName: string;
  email: string;
}> {
  const authMode = process.env.NEXT_PUBLIC_AUTH_MODE ?? "supabase";
  if (authMode !== "demo") {
    const supabase = createSupabaseBrowserClient();
    const { data: sessionData, error } = await supabase.auth.getSession();
    if (error || !sessionData.session) {
      throw new Error("Sign in to DevScope to continue");
    }
    const accessToken = sessionData.session.access_token;
    const existingWorkspace = window.sessionStorage.getItem("devscope_workspace_id");
    if (existingWorkspace) {
      const user = sessionData.session.user;
      return {
        token: accessToken,
        workspaceId: existingWorkspace,
        workspaceName:
          window.sessionStorage.getItem("devscope_workspace_name") ?? "DevScope workspace",
        userName:
          window.sessionStorage.getItem("devscope_user_name") ??
          user.user_metadata?.name ??
          user.email ??
          "DevScope user",
        email: user.email ?? "",
      };
    }
    const response = await fetch(`${apiUrl}/auth/session/bootstrap`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(body?.message ?? "Unable to initialize your DevScope workspace");
    }
    const result = await response.json() as {
      workspaceId: string;
      workspaceName: string;
      user: { name: string; email: string };
    };
    window.sessionStorage.setItem("devscope_session_token", accessToken);
    window.sessionStorage.setItem("devscope_workspace_id", result.workspaceId);
    window.sessionStorage.setItem("devscope_workspace_name", result.workspaceName);
    window.sessionStorage.setItem("devscope_user_name", result.user.name);
    window.sessionStorage.setItem("devscope_user_email", result.user.email);
    return {
      token: accessToken,
      workspaceId: result.workspaceId,
      workspaceName: result.workspaceName,
      userName: result.user.name,
      email: result.user.email,
    };
  }
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
