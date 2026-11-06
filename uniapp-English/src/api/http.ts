function resolveApiBase() {
  const fromEnv = import.meta.env.VITE_API_BASE as string | undefined;
  if (fromEnv) return fromEnv;
  // #ifdef H5
  try {
    const { protocol, hostname } = window.location;
    // 手机用局域网打开 H5 时，API 跟页面同主机，避免写死 127.0.0.1
    if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
      return `${protocol}//${hostname}:3010/api`;
    }
  } catch {
    /* ignore */
  }
  // #endif
  // App 真机调试：HBuilder 会把 127.0.0.1 代理到电脑；断开后需重新运行到手机
  return "http://127.0.0.1:3010/api";
}

const BASE_URL = resolveApiBase();

interface RequestOptions {
  method?: "GET" | "POST";
  data?: Record<string, unknown>;
  auth?: boolean;
}

export function request<T>(path: string, options: RequestOptions = {}) {
  const auth = options.auth !== false;
  const token = uni.getStorageSync("wq_token") as string;

  if (auth && !token) {
    uni.reLaunch({ url: "/pages/auth/login" });
    return Promise.reject(new Error("请先登录"));
  }

  return new Promise<T>((resolve, reject) => {
    uni.request({
      url: `${BASE_URL}${path}`,
      method: options.method ?? "GET",
      data: options.data,
      header: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T);
          return;
        }
        if (res.statusCode === 401) {
          uni.removeStorageSync("wq_token");
          uni.reLaunch({ url: "/pages/auth/login" });
        }
        const body = res.data as { message?: string | string[] };
        const message = Array.isArray(body?.message)
          ? body.message[0]
          : body?.message || "请求失败";
        reject(new Error(message));
      },
      fail: () => reject(new Error("网络异常，请确认后端已启动")),
    });
  });
}
