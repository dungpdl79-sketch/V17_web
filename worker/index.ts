/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Khởi tạo bộ nhớ tạm để đếm lượt truy cập của các IP (Tường lửa Rate Limiting)
const rateLimitMap = new Map<string, number[]>();

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    
    // --- 1. TƯỜNG LỬA BẢO VỆ (RATE LIMITING) ---
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const currentTime = Date.now();
    const windowMs = 10000; // Khung thời gian: 10 giây (10000 ms)
    const maxRequests = 20; // Giới hạn: 20 lần truy cập / 10 giây

    if (!rateLimitMap.has(ip)) {
      rateLimitMap.set(ip, []);
    }

    const timestamps = rateLimitMap.get(ip) || [];
    // Lọc bỏ những lịch sử truy cập đã cũ (ngoài 10 giây trước)
    const validTimestamps = timestamps.filter(time => currentTime - time < windowMs);
    
    // Nếu số lượt truy cập vượt quá giới hạn -> Chặn lại và báo lỗi 429
    if (validTimestamps.length >= maxRequests) {
      return new Response('Hệ thống đang bận do có quá nhiều thao tác. Các em học sinh vui lòng đợi 10 giây rồi thử lại nhé!', { 
        status: 429,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    // Ghi nhận lần truy cập mới nhất vào danh sách
    validTimestamps.push(currentTime);
    rateLimitMap.set(ip, validTimestamps);
    // --- KẾT THÚC PHẦN TƯỜNG LỬA ---

    const url = new URL(request.url);

    // Xử lý tối ưu hóa hình ảnh
    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    // Chuyển tiếp các yêu cầu còn lại tới ứng dụng chính
    return handler.fetch(request, env, ctx);
  },
};

export default worker;