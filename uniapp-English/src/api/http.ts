const BASE_URL = import.meta.env.VITE_API_BASE || "http://127.0.0.1:3000/api";

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
