/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
"use client";
import { useEffect, useState, useRef, useMemo, useCallback, memo } from "react";

type Data = {
  user: { email: string; name: string; role: "teacher" | "student" | null };
  classes: any[];
  exams: any[];
  attempts: any[];
};

// ==========================================
// CẤU HÌNH TÀI KHOẢN QUẢN TRỊ
// Trước đây email/tên giáo viên bị viết cứng giữa file LoginForm, rất khó tìm khi cần đổi.
// ==========================================
const TEACHER_ACCOUNT = { email: "thuyetdung@gmail.com", name: "Hồ Thuyết Dũng" };

// ==========================================
// TIỆN ÍCH CHUNG
// ==========================================

// LỖI CŨ: Xưởng V15 xuất type = 1 | 2 | 3 (số) còn màn hình này chỉ kiểm tra q.type === "mcq".
// Hậu quả: câu trắc nghiệm từ V15 hiện thành ô nhập text, mất hết phương án A/B/C/D.
// Hàm này quy về một chuẩn duy nhất và vẫn đọc được các file JSON đã xuất trước đây.
function questionType(q: any): "mcq" | "tf" | "sa" {
  const t = q?.type;
  if (t === 1 || t === "1" || t === "mcq") return "mcq";
  if (t === 2 || t === "2" || t === "tf") return "tf";
  if (t === 3 || t === "3" || t === "sa") return "sa";
  if (Array.isArray(q?.opts) && q.opts.length) return "mcq";
  if (Array.isArray(q?.stmts) && q.stmts.length) return "tf";
  return "sa";
}

function toScale10(score: any, maxScore: any): number {
  const s = Number(score);
  const m = Number(maxScore);
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0) return 0;
  return (s / m) * 10;
}
const fmt10 = (score: any, maxScore: any) => toScale10(score, maxScore).toFixed(1);

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const download = (blobParts: BlobPart[], type: string, filename: string) => {
  const blob = new Blob(blobParts, { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  // LỖI CŨ: Firefox bỏ qua a.click() nếu thẻ <a> chưa được gắn vào DOM -> nút tải im lặng không làm gì
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);
};

// ==========================================
// CẤU TRÚC MENU
// ==========================================
const V15_FEATURES = [
  "Nhập / Sửa Câu Hỏi",
  "Nạp Hàng Loạt (AI)",
  "Xưởng Ảnh → HTML",
  "Thống Kê Ngân Hàng",
  "Lọc Câu Trùng",
  "Danh Mục Bài Học"
];

const TEACHER_GROUPS = [
  {
    title: "XƯỞNG BIÊN SOẠN (MỞ TAB V15)",
    items: V15_FEATURES.map((id) => ({
      id,
      icon:
        id === "Nhập / Sửa Câu Hỏi" ? "📝" :
        id === "Nạp Hàng Loạt (AI)" ? "🤖" :
        id === "Xưởng Ảnh → HTML" ? "🖼️" :
        id === "Thống Kê Ngân Hàng" ? "📊" :
        id === "Lọc Câu Trùng" ? "🔍" : "📚"
    }))
  },
  {
    title: "HỆ THỐNG PHÁT ĐỀ ONLINE (V17)",
    items: [
      { id: "Studio đề", label: "Nạp Đề & Phát Bài", icon: "📤" },
      { id: "Lớp học", label: "Quản Lý Lớp Học", icon: "🏫" },
      { id: "Quản lý bài phát", label: "Quản Lý Bài Đã Phát", icon: "📋" },
      { id: "Nhúng link", label: "Nhúng Link Bổ Sung", icon: "🔗" },
      { id: "Kết quả", label: "Bảng Điểm & Kết Quả", icon: "🎯" },
      { id: "Tổng quan", label: "Tổng Quan Hệ Thống", icon: "📈" },
      { id: "Sao lưu", label: "Bảo Mật & Sao Lưu", icon: "⚙️" }
    ]
  }
];

const STUDENT_GROUPS = [
  {
    title: "KHÔNG GIAN HỌC TẬP",
    items: [
      { id: "Lớp của em", label: "Lớp Của Em", icon: "🏫" },
      { id: "Bài cần làm", label: "Bài Cần Làm", icon: "📝" },
      { id: "Kết quả", label: "Kết Quả Học Tập", icon: "🎯" },
      { id: "Năng lực", label: "Đánh Giá Năng Lực", icon: "📈" }
    ]
  }
];

// ==========================================
// HIỂN THỊ CÔNG THỨC TOÁN
// ==========================================
const MathText = memo(
  function MathText({ html, style, className }: { html: string; style?: React.CSSProperties; className?: string }) {
    const ref = useRef<HTMLSpanElement>(null);
    const rendered = useRef<string | null>(null);

    useEffect(() => {
      let mounted = true;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const tryTypeset = () => {
        if (!mounted || !ref.current) return;
        if (rendered.current !== html) {
          ref.current.innerHTML = html;
          rendered.current = html;
        }
        const MathJax = (window as any).MathJax;
        if (MathJax && typeof MathJax.typesetPromise === "function") {
          MathJax.typesetPromise([ref.current]).catch(() => {});
        } else {
          timer = setTimeout(tryTypeset, 200);
        }
      };

      tryTypeset();
      return () => {
        mounted = false;
        if (timer) clearTimeout(timer);
      };
    }, [html]);

    return <span ref={ref} style={style} className={className} />;
  },
  (prev, next) => prev.html === next.html
);

const StudentOptionItem = memo(
  function StudentOptionItem({ o, j, examId, qId, isChecked, onAnswerChange }: any) {
    return (
      <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer", background: isChecked ? "#eff6ff" : "#fff", padding: "10px 14px", borderRadius: "8px", border: "1px solid", borderColor: isChecked ? "#3b82f6" : "#cbd5e1", transition: "background 0.15s ease, border-color 0.15s ease" }}>
        <input type="radio" name={`${examId}-${qId}`} style={{ marginTop: "4px", width: "18px", height: "18px", accentColor: "#2563eb" }} checked={isChecked} onChange={() => onAnswerChange(examId, qId, String(j))} />
        <MathText html={`<b>${String.fromCharCode(65 + j)}.</b> ${o}`} style={{ fontSize: "16px", lineHeight: "1.5" }} />
      </label>
    );
  },
  (prev, next) => prev.isChecked === next.isChecked && prev.o === next.o
);

// Đáp án Đúng/Sai được mã hóa thành chuỗi 4 ký tự: 'T' = đúng, 'F' = sai, '-' = chưa chọn.
// Ví dụ "TF-T" nghĩa là ý a Đúng, ý b Sai, ý c bỏ trống, ý d Đúng.
const TF_EMPTY = "----";
const tfCharAt = (val: string, j: number) => (val || TF_EMPTY)[j] || "-";
const tfSetChar = (val: string, j: number, ch: string) => {
  const arr = (val || TF_EMPTY).padEnd(4, "-").slice(0, 4).split("");
  arr[j] = ch;
  return arr.join("");
};

const StudentTrueFalseItem = memo(
  function StudentTrueFalseItem({ s, j, examId, qId, answerValue, onAnswerChange }: any) {
    const cur = tfCharAt(answerValue, j);
    const nut = (ch: string, nhan: string, mau: string) => (
      <button
        type="button"
        onClick={() => onAnswerChange(examId, qId, tfSetChar(answerValue, j, cur === ch ? "-" : ch))}
        style={{
          padding: "8px 18px", borderRadius: "8px", fontWeight: "bold", fontSize: "14px", cursor: "pointer",
          border: cur === ch ? `2px solid ${mau}` : "1px solid #cbd5e1",
          background: cur === ch ? mau : "#fff",
          color: cur === ch ? "#fff" : "#475569",
          minWidth: "72px"
        }}
      >
        {nhan}
      </button>
    );
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "10px 14px", background: "#fff", borderRadius: "8px", border: "1px solid #cbd5e1", flexWrap: "wrap" }}>
        <MathText html={`<b>${String.fromCharCode(97 + j)})</b> ${s?.t ?? s ?? ""}`} style={{ fontSize: "16px", lineHeight: "1.5", flex: "1 1 260px" }} />
        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          {nut("T", "Đúng", "#10b981")}
          {nut("F", "Sai", "#ef4444")}
        </div>
      </div>
    );
  },
  (prev, next) => tfCharAt(prev.answerValue, prev.j) === tfCharAt(next.answerValue, next.j) && prev.s === next.s
);

const StudentQuestionItem = memo(
  function StudentQuestionItem({ q, i, examId, answerValue, onAnswerChange }: any) {
    const loai = questionType(q);
    return (
      <div style={{ marginBottom: "28px", padding: "20px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
        <div style={{ fontSize: "17px", fontWeight: "bold", color: "#1e293b", marginBottom: "16px", lineHeight: "1.6" }}>
          Câu {i + 1}. <MathText html={q.q || ""} />
        </div>
        {loai === "mcq" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginLeft: "10px" }}>
            {(q.opts || []).map((o: string, j: number) => (
              <StudentOptionItem key={j} o={o} j={j} examId={examId} qId={q.id} isChecked={answerValue === String(j)} onAnswerChange={onAnswerChange} />
            ))}
          </div>
        )}
        {/* LỖI CŨ: dạng Đúng/Sai 4 ý hoàn toàn không có giao diện, bị rơi xuống ô nhập text */}
        {loai === "tf" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginLeft: "10px" }}>
            {(q.stmts || []).slice(0, 4).map((s: any, j: number) => (
              <StudentTrueFalseItem key={j} s={s} j={j} examId={examId} qId={q.id} answerValue={answerValue} onAnswerChange={onAnswerChange} />
            ))}
          </div>
        )}
        {loai === "sa" && (
          <input style={{ width: "100%", maxWidth: "400px", padding: "14px", marginTop: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "16px", background: "#fff" }} placeholder="Nhập câu trả lời của bạn..." value={answerValue || ""} onChange={(x) => onAnswerChange(examId, q.id, x.target.value)} />
        )}
      </div>
    );
  },
  (prev, next) => prev.answerValue === next.answerValue && prev.q === next.q
);

function ExamTimer({ endTime, onTimeOut }: { endTime: number; onTimeOut: () => void }) {
  const [timeLeft, setTimeLeft] = useState("");
  const firedRef = useRef(false);
  const cbRef = useRef(onTimeOut);

  useEffect(() => {
    cbRef.current = onTimeOut;
  });

  useEffect(() => {
    firedRef.current = false;
    // LỖI CŨ: `let id` được dùng bên trong tick() trước khi setInterval gán giá trị
    const idRef: { current: ReturnType<typeof setInterval> | null } = { current: null };
    const stop = () => { if (idRef.current) clearInterval(idRef.current); };

    const tick = () => {
      const diff = endTime - Date.now();
      if (diff <= 0) {
        setTimeLeft("00:00 (Hết giờ)");
        stop();
        if (!firedRef.current) {
          firedRef.current = true;
          cbRef.current?.();
        }
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`);
    };

    idRef.current = setInterval(tick, 1000);
    tick();
    return stop;
  }, [endTime]);

  return (
    <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "8px 16px", borderRadius: "8px", fontWeight: "bold", fontSize: "16px", border: "1px solid #fca5a5" }}>
      ⏱️ Còn lại: {timeLeft || "--:--"}
    </div>
  );
}

export default function Dashboard({ initialUser, logoutAction, changePasswordAction, resetPasswordAction }: any) {
  const [data, setData] = useState<Data>({ user: { ...initialUser, role: initialUser.role || null }, classes: [], exams: [], attempts: [] });
  const [active, setActive] = useState(initialUser?.role === "student" ? "Bài cần làm" : "Studio đề");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});

  const roleSyncedRef = useRef(false);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  const act = useCallback(async (payload: Record<string, unknown>, silent = false) => {
    setBusy(true);
    try {
      const r = await fetch("/api/v17", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!silent) {
        setNote(r.ok ? (j.score !== undefined ? `Đã nộp: ${j.score}/${j.maxScore} điểm.` : "Đã thao tác thành công.") : j.error || "Thao tác thất bại.");
      }
      if (r.ok) await loadRef.current();
      return j;
    } catch {
      setNote("Đã xảy ra lỗi mạng. Kiểm tra kết nối rồi thử lại.");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/v17", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) {
        setNote(j.error || "Không tải được dữ liệu.");
        return;
      }
      if (initialUser.role && j.user?.role !== initialUser.role && !roleSyncedRef.current) {
        roleSyncedRef.current = true;
        await act({ action: "setRole", role: initialUser.role, name: initialUser.name }, true);
        return;
      }
      setData(j);
    } catch {
      setNote("Không thể kết nối đến máy chủ.");
    }
  }, [act, initialUser.role, initialUser.name]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!document.getElementById("mathjax-script")) {
      (window as any).MathJax = { tex: { inlineMath: [["$", "$"], ["\\(", "\\)"]], displayMath: [["$$", "$$"], ["\\[", "\\]"]] }, startup: { typeset: false } };
      const script = document.createElement("script");
      script.id = "mathjax-script";
      script.src = "https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-mml-chtml.js";
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  const triggerMath = useCallback(() => {
    setTimeout(() => {
      if ((window as any).MathJax?.typesetPromise) (window as any).MathJax.typesetPromise().catch(() => {});
      if ((window as any).MathViz?.renderAll) (window as any).MathViz.renderAll();
    }, 100);
  }, []);

  useEffect(() => {
    triggerMath();
  }, [active, data, triggerMath]);

  if (!data.user.role)
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#1e3a8a", fontWeight: "bold", fontSize: "18px" }}>Đang đồng bộ phân quyền an toàn...</div>;

  const teacher = data.user.role === "teacher";
  const groups = teacher ? TEACHER_GROUPS : STUDENT_GROUPS;

  return (
    <div className="app-shell" style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#f8fafc" }}>
      <aside style={{ width: "270px", background: "#153d8a", color: "#fff", display: "flex", flexDirection: "column", height: "100vh", overflowY: "auto", flexShrink: 0, borderRight: "1px solid #1e3a8a" }}>
        <div style={{ padding: "24px 20px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <h2 style={{ color: "#fbbf24", fontSize: "24px", fontWeight: 900, margin: "0 0 8px 0", textTransform: "uppercase", lineHeight: "1.2", textShadow: "0 2px 4px rgba(0,0,0,0.3)", fontFamily: "'Montserrat', sans-serif" }}>ĐỈNH CAO<br />TRÍ TUỆ</h2>
          <p style={{ color: "#fbbf24", fontSize: "14px", fontWeight: "bold", margin: "12px 0 0", textTransform: "uppercase" }}>{teacher ? "ADMIN" : "HỌC SINH"} : {data.user.name}</p>
        </div>

        <nav style={{ padding: "16px 12px", flex: 1, display: "flex", flexDirection: "column", gap: "20px" }}>
          {groups.map((g) => (
            <div key={g.title}>
              <div style={{ color: "#93c5fd", fontSize: "12px", fontWeight: 900, textTransform: "uppercase", marginBottom: "8px", paddingLeft: "8px", letterSpacing: "0.5px" }}>{g.title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {g.items.map((item: any) => {
                  const isActive = active === item.id;
                  const isV15 = V15_FEATURES.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (isV15) window.open("/v15.html", "_blank");
                        else setActive(item.id);
                      }}
                      style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", padding: "10px 14px", borderRadius: "8px", border: isActive ? "1px solid #60a5fa" : "1px solid transparent", background: isActive ? "#2563eb" : "transparent", color: "#fff", fontSize: "14px", fontWeight: isActive ? "bold" : 600, cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
                    >
                      <span style={{ fontSize: "18px" }}>{item.icon}</span>
                      {item.label || item.id}
                      {isV15 && <span style={{ marginLeft: "auto", fontSize: "12px", opacity: 0.6 }}>↗</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div style={{ padding: "20px", borderTop: "1px solid rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.1)" }}>
          <p style={{ color: "#93c5fd", fontSize: "12px", margin: "0 0 12px 0", textAlign: "center" }}>Cloud DB: {data.exams?.length || 0} bài · an toàn</p>
          <button
            onClick={async () => {
              if (logoutAction) {
                await logoutAction();
                window.location.href = "/";
              }
            }}
            style={{ width: "100%", padding: "10px", background: "transparent", border: "1px solid #3b82f6", color: "#fff", fontWeight: "bold", borderRadius: "8px", cursor: "pointer", fontSize: "15px", transition: "0.2s" }}
          >
            Đăng Xuất
          </button>
        </div>
      </aside>

      <main className="workspace" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <header style={{ padding: "20px 40px", borderBottom: "1px solid #e2e8f0", background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p className="eyebrow" style={{ fontSize: "12px", color: "#64748b", fontWeight: "bold", letterSpacing: "1px", marginBottom: "4px", textTransform: "uppercase" }}>NĂM HỌC 2026–2027</p>
            <h1 style={{ margin: 0, color: "#1e293b", fontSize: "24px" }}>{active}</h1>
          </div>
          <div className="header-actions" style={{ display: "flex", gap: "15px", alignItems: "center" }}>
            <span style={{ color: "#10b981", fontSize: "13px", fontWeight: "bold" }}>● Đã đồng bộ</span>
            <button style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontWeight: "bold" }} onClick={() => window.print()}>Xuất PDF</button>
          </div>
        </header>

        <div style={{ padding: "30px 40px", flex: 1 }}>
          {note && (
            <div className="notice" style={{ padding: "12px 16px", background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e3a8a", borderRadius: "8px", marginBottom: "20px", display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
              {note}
              <button style={{ border: "none", background: "none", cursor: "pointer", fontSize: "16px" }} onClick={() => setNote("")}>×</button>
            </div>
          )}

          {teacher ? (
            <Teacher active={active} data={data} busy={busy} act={act} triggerMath={triggerMath} changePasswordAction={changePasswordAction} resetPasswordAction={resetPasswordAction} />
          ) : (
            <Student active={active} data={data} busy={busy} act={act} answers={answers} setAnswers={setAnswers} triggerMath={triggerMath} />
          )}
        </div>
      </main>
    </div>
  );
}

// ==========================================
// KHU VỰC GIÁO VIÊN
// ==========================================
function Teacher({ active, data, busy, act, triggerMath, changePasswordAction, resetPasswordAction }: any) {
  const [name, setName] = useState("");
  const [exam, setExam] = useState({ classId: "", duration: 45 });
  const [previewData, setPreviewData] = useState<any>(null);
  // LỖI CŨ: khởi tạo null nhưng bên dưới đọc previewMeta.showScore / .numVersions
  // -> chỉ cần một luồng state lệch nhau là trắng trang. Cho giá trị mặc định đầy đủ.
  const [previewMeta, setPreviewMeta] = useState<any>({ classId: "", duration: 45, title: "", showScore: true, numVersions: 45 });
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<any>(null);
  const [selectedClassToDelete, setSelectedClassToDelete] = useState("");

  const [links, setLinks] = useState<{ name: string; url: string }[]>([]);
  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");

  useEffect(() => {
    if (previewData) triggerMath();
  }, [previewData, editIdx, triggerMath]);

  useEffect(() => {
    setLinks(safeParse<{ name: string; url: string }[]>(localStorage.getItem("v17_teacher_links"), []));
  }, []);

  const saveLinks = (newLinks: { name: string; url: string }[]) => {
    setLinks(newLinks);
    try {
      localStorage.setItem("v17_teacher_links", JSON.stringify(newLinks));
    } catch {}
  };

  const getQuestionsFromJSON = (json: any): any[] => {
    if (!json) return [];
    if (Array.isArray(json)) return json;
    if (Array.isArray(json.questions)) return json.questions;
    if (Array.isArray(json.data)) return json.data;
    for (const key in json) if (Array.isArray(json[key])) return json[key];
    return [];
  };

  const updateQuestionsInJSON = (originalJson: any, newQs: any[]) => {
    if (Array.isArray(originalJson)) return newQs;
    if (Array.isArray(originalJson?.questions)) return { ...originalJson, questions: newQs };
    if (Array.isArray(originalJson?.data)) return { ...originalJson, data: newQs };
    for (const key in originalJson) if (Array.isArray(originalJson[key])) return { ...originalJson, [key]: newQs };
    return { ...originalJson, questions: newQs };
  };

  const normalizeJson = (json: any) => {
    const qs = getQuestionsFromJSON(json);
    const seen = new Set<string>();
    const fixed = qs.map((q: any, i: number) => {
      let id = q?.id != null && String(q.id).trim() !== "" ? String(q.id) : `q${i + 1}`;
      while (seen.has(id)) id = `${id}-${i + 1}`;
      seen.add(id);
      return { ...q, id };
    });
    return { json: updateQuestionsInJSON(json, fixed), count: fixed.length };
  };

  const previewQs = getQuestionsFromJSON(previewData);

  if (V15_FEATURES.includes(active)) {
    return (
      <div style={{ background: "#fff", padding: "40px", borderRadius: "16px", border: "1px dashed #cbd5e1", textAlign: "center", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}>
        <h2 style={{ color: "#3b82f6", marginBottom: "16px", fontSize: "24px" }}>🚀 Đang khởi động Xưởng Biên Soạn V15...</h2>
        <p style={{ fontSize: "16px", color: "#64748b", lineHeight: "1.6", maxWidth: "600px", margin: "0 auto" }}>
          Hệ thống mở Xưởng V15 ở một tab mới để bảo toàn dữ liệu đang soạn.<br /><br />
          Nếu trình duyệt chặn pop-up, bấm nút bên dưới để mở thủ công.
        </p>
        <button onClick={() => window.open("/v15.html", "_blank")} style={{ marginTop: "20px", background: "#10b981", color: "#fff", border: "none", padding: "12px 24px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "16px" }}>Mở Xưởng V15 Ngay</button>
      </div>
    );
  }

  // ==========================================
  // XỬ LÝ KHỐI PHÁT ĐỀ (ĐÃ MỞ RỘNG FULL TRANG THEO ẢNH YÊU CẦU)
  // ==========================================
  if (active === "Studio đề") {
    if (previewData) {
      return (
        <div style={{ width: "100%" }}>
          <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1", width: "100%" }}>
            <div style={{ marginBottom: "20px", padding: "16px", background: "#f1f5f9", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontWeight: "bold", color: "#1e3a8a" }}>
                <input type="checkbox" checked={!!previewMeta.showScore} onChange={(e) => setPreviewMeta({ ...previewMeta, showScore: e.target.checked })} style={{ width: "18px", height: "18px" }} />
                🔓 Cho phép học sinh xem điểm & đáp án ngay sau khi nộp bài
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "15px", flexWrap: "wrap" }}>
                <span style={{ fontWeight: "bold", color: "#334155" }}>🔢 Số lượng mã đề cần tạo (ví dụ sĩ số lớp 45):</span>
                <input
                  type="number" min={1} max={100} value={previewMeta.numVersions}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setPreviewMeta({ ...previewMeta, numVersions: Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : 1 });
                  }}
                  style={{ width: "120px", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "16px", fontWeight: "bold", color: "#1e3a8a" }}
                />
                <span style={{ fontSize: "13px", color: "#64748b" }}>(Hệ thống tự sinh từng đề riêng biệt)</span>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <h3 style={{ margin: 0 }}>Danh sách câu hỏi gốc ({previewQs.length} câu)</h3>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button onClick={() => window.open('/v15.html', '_blank')} style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid #fcd34d", background: "#fffbeb", color: "#b45309", cursor: "pointer", fontWeight: "bold" }}>🖼️ Mở Xưởng Ảnh</button>
                <button onClick={() => { setPreviewData(null); setEditIdx(null); }} style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer", fontWeight: "bold" }}>Hủy bỏ</button>
                <button
                  style={{ background: "#1e3a8a", color: "#fff", border: "none", padding: "10px 16px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
                  disabled={busy || previewQs.length === 0 || editIdx !== null}
                  onClick={() => {
                    act({ action: "importJsonExam", classId: previewMeta.classId, duration: previewMeta.duration, title: previewMeta.title, showScore: previewMeta.showScore, numVersions: previewMeta.numVersions, jsonData: previewData });
                    setPreviewData(null);
                    setEditIdx(null);
                  }}
                >
                  🚀 Xác nhận Phát bài ngay ({previewMeta.numVersions} mã đề)
                </button>
              </div>
            </div>

            <div style={{ maxHeight: "65vh", overflowY: "auto", paddingRight: "10px", borderTop: "2px solid #e2e8f0", paddingTop: "20px" }}>
              {previewQs.map((q: any, i: number) => (
                <div key={`${q.id}-${i}`} style={{ marginBottom: "20px", padding: "16px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                  {editIdx === i && editDraft ? (
                    <div>
                      <textarea value={editDraft.q || ""} onChange={(e) => setEditDraft({ ...editDraft, q: e.target.value })} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", minHeight: "100px", marginBottom: "10px" }} />
                      {questionType(editDraft) === "mcq" && (editDraft.opts || []).map((opt: string, oIdx: number) => (
                        <div key={oIdx} style={{ display: "flex", gap: "10px", marginBottom: "8px" }}>
                          <span style={{ fontWeight: "bold", width: "24px", paddingTop: "8px" }}>{String.fromCharCode(65 + oIdx)}.</span>
                          <textarea value={opt} onChange={(e) => { const newOpts = [...(editDraft.opts || [])]; newOpts[oIdx] = e.target.value; setEditDraft({ ...editDraft, opts: newOpts }); }} style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", minHeight: "40px" }} />
                        </div>
                      ))}
                      <div style={{ marginTop: "10px", display: "flex", gap: "10px" }}>
                        <button
                          onClick={() => {
                            const newQs = previewQs.map((oldQ: any, idx: number) => (idx === i ? editDraft : oldQ));
                            setPreviewData(updateQuestionsInJSON(previewData, newQs));
                            setEditIdx(null);
                            setEditDraft(null);
                          }}
                          style={{ padding: "8px 16px", background: "#10b981", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}
                        >
                          Lưu chỉnh sửa
                        </button>
                        <button onClick={() => { setEditIdx(null); setEditDraft(null); }} style={{ padding: "8px 16px", background: "#cbd5e1", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>Hủy sửa</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <b style={{ display: "block", marginBottom: "12px", fontSize: "1.05em", color: "#1e293b" }}>Câu {i + 1}. <MathText html={q.q || ""} /></b>
                      {/* LỖI CŨ: chỉ so q.type === "mcq" nên đề từ V15 (type là số) xem trước không thấy phương án */}
                      {questionType(q) === "mcq" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginLeft: "10px", marginBottom: "16px" }}>
                          {(q.opts || []).map((o: string, j: number) => <MathText key={j} html={`${String.fromCharCode(65 + j)}. ${o}`} />)}
                        </div>
                      )}
                      {questionType(q) === "tf" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginLeft: "10px", marginBottom: "16px" }}>
                          {(q.stmts || []).map((s: any, j: number) => <MathText key={j} html={`${String.fromCharCode(97 + j)}) ${s?.t ?? ""} — <b>${s?.ans ? "ĐÚNG" : "SAI"}</b>`} />)}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: "10px" }}>
                        <button onClick={() => { setEditIdx(i); setEditDraft(JSON.parse(JSON.stringify(q))); }} style={{ padding: "6px 12px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "bold" }}>✏️ Sửa câu này</button>
                        <button
                          onClick={() => {
                            if (confirm(`Xóa câu ${i + 1} khỏi đề?`)) {
                              const newQs = previewQs.filter((_: any, idx: number) => idx !== i);
                              setPreviewData(updateQuestionsInJSON(previewData, newQs));
                              setEditIdx(null);
                            }
                          }}
                          style={{ padding: "6px 12px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "bold" }}
                        >
                          🗑️ Xóa câu này
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ width: "100%" }}>
        <div style={{ background: "#fff", padding: "40px", borderRadius: "16px", border: "1px solid #cbd5e1", boxShadow: "0 4px 10px rgba(0,0,0,0.05)", width: "100%" }}>
          <h2 style={{ marginTop: 0, color: "#1e3a8a", fontSize: "24px", marginBottom: "10px" }}>📤 Nạp Đề & Phát Bài</h2>
          <p style={{ color: "#64748b", fontSize: "16px", marginBottom: "30px" }}>Tải file JSON đã thiết kế từ Xưởng V15 để phát trực tiếp lên máy chủ cho học sinh.</p>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "800px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "8px", fontWeight: "bold", color: "#334155" }}>
              Chọn lớp phát đề
              <select value={exam.classId} onChange={(e) => setExam({ ...exam, classId: e.target.value })} style={{ padding: "16px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "15px", width: "100%", background: "#f8fafc" }}>
                <option value="">— Vui lòng chọn lớp —</option>
                {(data.classes || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "8px", fontWeight: "bold", color: "#334155" }}>
              Thời gian làm bài (phút)
              <input
                type="number" min={1} max={300} value={exam.duration}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setExam({ ...exam, duration: Number.isFinite(n) && n > 0 ? n : 1 });
                }}
                style={{ padding: "16px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", fontSize: "15px", width: "100%", background: "#f8fafc" }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: "8px", fontWeight: "bold", color: "#334155" }}>
              Tải file sao lưu (.json)
              <input type="file" accept=".json,application/json" id="json-exam-file" style={{ padding: "16px", border: "2px dashed #cbd5e1", borderRadius: "8px", background: "#f8fafc", cursor: "pointer", width: "100%" }} />
            </label>

            <button
              style={{ background: "#1e3a8a", color: "#fff", border: "none", padding: "18px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "17px", marginTop: "10px", width: "100%" }}
              disabled={!exam.classId || busy}
              onClick={() => {
                const input = document.getElementById("json-exam-file") as HTMLInputElement | null;
                const f = input?.files?.[0];
                if (!f) return alert("Hãy chọn file .json đã xuất từ V15.");
                const r = new FileReader();
                r.onerror = () => alert("Không đọc được file. Hãy thử chọn lại.");
                r.onload = (e) => {
                  try {
                    const raw = JSON.parse(String(e.target?.result || ""));
                    const { json, count } = normalizeJson(raw);
                    if (count === 0) return alert("File hợp lệ nhưng không tìm thấy câu hỏi nào bên trong.");
                    setPreviewData(json);
                    setPreviewMeta({ classId: exam.classId, duration: exam.duration, title: f.name.replace(/\.[^/.]+$/, ""), showScore: true, numVersions: 45 });
                    setEditIdx(null);
                  } catch {
                    alert("File JSON sai định dạng. Hãy xuất lại từ Xưởng V15.");
                  }
                };
                r.readAsText(f);
              }}
            >
              👀 Tải lên & Kiểm duyệt nội dung
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (active === "Nhúng link") {
    return (
      <div>
        <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1", marginBottom: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
          <h3 style={{ marginTop: 0, color: "#1e3a8a" }}>➕ Thêm liên kết mới</h3>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
            <input placeholder="Tên liên kết (vd: Phòng Google Meet khối 12)" value={newLinkName} onChange={(e) => setNewLinkName(e.target.value)} style={{ flex: "1 1 200px", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none" }} />
            <input placeholder="Đường dẫn URL (vd: https://meet.google.com/...)" value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} style={{ flex: "2 1 300px", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none" }} />
            <button
              style={{ background: "#10b981", color: "#fff", border: "none", padding: "12px 24px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
              onClick={() => {
                const n = newLinkName.trim();
                let u = newLinkUrl.trim();
                if (!n || !u) return alert("Vui lòng nhập đầy đủ tên và đường dẫn URL.");
                if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
                saveLinks([...links, { name: n, url: u }]);
                setNewLinkName("");
                setNewLinkUrl("");
              }}
            >
              Thêm Link
            </button>
          </div>
        </div>

        <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
          <h3 style={{ marginTop: 0, color: "#1e3a8a" }}>🔗 Danh sách liên kết đã lưu</h3>
          {links.length === 0 && <p style={{ color: "#64748b" }}>Chưa có liên kết nào. Thêm một liên kết ở khung phía trên.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
            {links.map((lnk, idx) => (
              <div key={`${lnk.url}-${idx}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <b style={{ color: "#0f172a", fontSize: "16px" }}>{lnk.name}</b>
                  <br />
                  <a href={lnk.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "14px", color: "#3b82f6", textDecoration: "none", wordBreak: "break-all" }}>{lnk.url}</a>
                </div>
                <button style={{ background: "#fee2e2", color: "#b91c1c", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }} onClick={() => { if (confirm(`Xóa liên kết "${lnk.name}"?`)) saveLinks(links.filter((_, i) => i !== idx)); }}>🗑️ Xóa</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (active === "Lớp học")
    return (
      <div>
        <form
          style={{ display: "flex", gap: "10px", marginBottom: "20px" }}
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim();
            if (!n) return alert("Nhập tên lớp trước khi tạo.");
            act({ action: "createClass", name: n });
            setName("");
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Toán 12A09" style={{ flex: 1, padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none" }} />
          <button disabled={busy} style={{ background: "#1e3a8a", color: "#fff", border: "none", padding: "0 24px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>＋ Tạo lớp</button>
        </form>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "20px" }}>
          {(data.classes || []).map((c: any) => (
            <article key={c.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "20px", display: "flex", gap: "16px", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
              <div style={{ width: "48px", height: "48px", background: "#eff6ff", color: "#2563eb", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "18px" }}>12</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                  <h3 style={{ margin: 0, color: "#1e293b", fontSize: "18px" }}>{c.name}</h3>
                  <button
                    title="Xóa lớp học này"
                    style={{ background: "#fee2e2", color: "#b91c1c", border: "none", padding: "4px 8px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Xóa lớp "${c.name}"? Đề thi và bảng điểm liên quan có thể bị ảnh hưởng.`)) act({ action: "deleteClass", classId: c.id });
                    }}
                  >
                    🗑️ Xóa lớp
                  </button>
                </div>
                <p style={{ margin: "0 0 8px 0", color: "#64748b", fontSize: "14px" }}>{c.students ?? 0} học sinh · {c.schoolYear || "—"}</p>
                <span style={{ fontSize: "13px", color: "#10b981", background: "#f0fdf4", padding: "4px 8px", borderRadius: "4px", fontWeight: "bold" }}>Mã: {c.code}</span>
              </div>
            </article>
          ))}
          {!(data.classes || []).length && <p style={{ color: "#64748b", fontStyle: "italic" }}>Chưa có lớp học nào. Tạo lớp đầu tiên ở ô phía trên.</p>}
        </div>
      </div>
    );

  if (active === "Kết quả")
    return (
      <div>
        <div style={{ marginBottom: "20px", display: "flex", gap: "10px", alignItems: "center", background: "#fef2f2", padding: "16px", borderRadius: "12px", border: "1px solid #fca5a5", flexWrap: "wrap" }}>
          <span style={{ fontWeight: "bold", color: "#b91c1c" }}>🗑️ Xóa kết quả theo lớp:</span>
          <select value={selectedClassToDelete} onChange={(e) => setSelectedClassToDelete(e.target.value)} style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #f87171", outline: "none", flex: "1 1 200px", maxWidth: "300px" }}>
            <option value="">-- Menu chọn lớp --</option>
            {(data.classes || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button
            style={{ background: selectedClassToDelete ? "#b91c1c" : "#fca5a5", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", fontWeight: "bold", cursor: selectedClassToDelete ? "pointer" : "not-allowed" }}
            disabled={!selectedClassToDelete || busy}
            onClick={() => {
              if (confirm("🚨 Xóa TOÀN BỘ kết quả điểm của lớp này? Hành động không thể hoàn tác.")) {
                act({ action: "deleteAttemptsByClass", classId: selectedClassToDelete });
                setSelectedClassToDelete("");
              }
            }}
          >
            Xóa nguyên lớp
          </button>
        </div>

        <Results rows={data.attempts || []} exams={data.exams || []} classes={data.classes || []} act={act} busy={busy} />
      </div>
    );

  if (active === "Sao lưu")
    return (
      <div>
        <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1", marginBottom: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
          <h3 style={{ marginTop: 0, color: "#1e3a8a", display: "flex", alignItems: "center", gap: "8px" }}>🔑 Cài đặt Mật khẩu Giáo viên</h3>
          <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "20px" }}>Bảo vệ tài khoản quản trị. Mật khẩu được mã hóa trên máy chủ.</p>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button
              style={{ background: "#10b981", color: "#fff", border: "none", padding: "12px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
              disabled={busy}
              onClick={async () => {
                const newPass = prompt("Nhập mật khẩu MỚI:");
                if (newPass === null) return;
                if (newPass.trim().length < 8) return alert("Mật khẩu cần ít nhất 8 ký tự.");
                if (typeof changePasswordAction !== "function") return alert("Máy chủ chưa bật chức năng đổi mật khẩu.");
                // LỖI CŨ: báo "✅ Đã đổi mật khẩu" kể cả khi máy chủ trả lỗi
                try {
                  const kq = await changePasswordAction(newPass.trim());
                  if (kq?.error) return alert("❌ " + kq.error);
                  alert("✅ Đã đổi mật khẩu.");
                } catch {
                  alert("❌ Không kết nối được máy chủ. Mật khẩu chưa được đổi.");
                }
              }}
            >
              Đổi mật khẩu mới
            </button>

            <button
              style={{ background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", padding: "12px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
              disabled={busy}
              onClick={async () => {
                if (!confirm("Khôi phục về mật khẩu gốc (TEACHER_PASSWORD cài trong Cloudflare)?")) return;
                if (typeof resetPasswordAction !== "function") return alert("Máy chủ chưa bật chức năng khôi phục.");
                try {
                  const kq = await resetPasswordAction();
                  if (kq?.error) return alert("❌ " + kq.error);
                  alert("✅ Đã khôi phục về mật khẩu gốc cài trong Cloudflare.");
                } catch {
                  alert("❌ Không kết nối được máy chủ. Mật khẩu chưa đổi.");
                }
              }}
            >
              Khôi phục về mặc định
            </button>
          </div>
        </div>

        <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
          <h3 style={{ marginTop: 0, color: "#1e3a8a", display: "flex", alignItems: "center", gap: "8px" }}>💾 Sao lưu kết quả lớp học</h3>
          <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "20px" }}>Tải toàn bộ điểm số và thời gian nộp bài về máy với 3 định dạng.</p>
          <div style={{ display: "flex", gap: "15px", flexWrap: "wrap", marginTop: "10px" }}>
            <button style={{ flex: "1 1 200px", background: "#10b981", color: "#fff", border: "none", padding: "14px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "15px" }} onClick={() => exportExcel(data.attempts || [], data.exams || [])}>📊 Tải Excel</button>
            <button style={{ flex: "1 1 200px", background: "#2563eb", color: "#fff", border: "none", padding: "14px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "15px" }} onClick={() => exportDoc(data.attempts || [], data.exams || [])}>📝 Tải Word (.doc)</button>
            <button style={{ flex: "1 1 200px", background: "#ef4444", color: "#fff", border: "none", padding: "14px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "15px" }} onClick={() => printPdf(data.attempts || [], data.exams || [])}>🖨️ In / Lưu PDF</button>
          </div>
        </div>
      </div>
    );

  if (active === "Quản lý bài phát")
    return (
      <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1" }}>
        <h3 style={{ marginTop: 0, color: "#1e3a8a", marginBottom: "20px" }}>Danh sách bài đã phát</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {(data.exams || []).map((e: any) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <div>
                <b style={{ fontSize: "16px", color: "#0f172a" }}>{e.title}</b>
                <br />
                <small style={{ color: "#64748b" }}>Mã bài: <b style={{ color: "#3b82f6" }}>{e.code}</b> · {e.durationMinutes} phút</small>
              </div>
              <button style={{ background: "#fee2e2", color: "#b91c1c", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }} disabled={busy} onClick={() => { if (confirm(`Xóa bài "${e.title}"?`)) act({ action: "deleteExam", examId: e.id }); }}>🗑️ Xóa bài</button>
            </div>
          ))}
          {!(data.exams || []).length && <p style={{ color: "#64748b" }}>Chưa có bài kiểm tra nào được phát.</p>}
        </div>
      </div>
    );

  const attempts: any[] = data.attempts || [];
  const avg = attempts.length ? attempts.reduce((s: number, a: any) => s + toScale10(a.score, a.maxScore), 0) / attempts.length : 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
      <StatCard label="Tổng số lớp" value={(data.classes || []).length} />
      <StatCard label="Tổng học sinh" value={(data.classes || []).reduce((s: number, c: any) => s + (Number(c.students) || 0), 0)} />
      <StatCard label="Bài đã phát" value={(data.exams || []).length} />
      <StatCard label="Điểm trung bình" value={attempts.length ? avg.toFixed(1) : "—"} color="#10b981" />
    </div>
  );
}

function StatCard({ label, value, color = "#1e3a8a" }: { label: string; value: any; color?: string }) {
  return (
    <article style={{ background: "#fff", padding: "20px", borderRadius: "12px", border: "1px solid #cbd5e1", textAlign: "center" }}>
      <small style={{ color: "#64748b", fontWeight: "bold" }}>{label}</small>
      <div style={{ fontSize: "32px", color, fontWeight: 900, margin: "10px 0" }}>{value}</div>
    </article>
  );
}

// ==========================================
// KHU VỰC HỌC SINH
// ==========================================
function Student({ active, data, busy, act, answers, setAnswers, triggerMath }: any) {
  const [join, setJoin] = useState("");
  const [shuffledExams, setShuffledExams] = useState<Record<string, any[]>>({});
  const [examTimers, setExamTimers] = useState<Record<string, number>>({});
  const [warnings, setWarnings] = useState<Record<string, number>>({});
  const [warningModal, setWarningModal] = useState<string | null>(null);

  const email = data.user?.email || "guest";
  const ANSWER_KEY = `v17_answers_${email}`;
  const DEADLINE_KEY = `v17_deadlines_${email}`;
  const WARN_KEY = `v17_warnings_${email}`;

  const actRef = useRef(act);
  const answersRef = useRef(answers);
  const warnRef = useRef<Record<string, number>>({});
  const submittedRef = useRef<Set<string>>(new Set());
  
  const isConfirmingRef = useRef(false);

  useEffect(() => { actRef.current = act; });
  useEffect(() => { answersRef.current = answers; }, [answers]);

  useEffect(() => {
    setAnswers(safeParse<Record<string, Record<string, string>>>(localStorage.getItem(ANSWER_KEY), {}));
    warnRef.current = safeParse<Record<string, number>>(localStorage.getItem(WARN_KEY), {});
    setWarnings(warnRef.current);
  }, [ANSWER_KEY, WARN_KEY, setAnswers]);

  const currentExams = useMemo(() => {
    const exams: any[] = data.exams || [];
    const groups: Record<string, any[]> = {};
    exams.forEach((e: any) => {
      const baseTitle = String(e.title || "").replace(/\s*[-–(]\s*(Đề|Mã|Version|Phần).*$/i, "").trim() || String(e.id);
      (groups[baseTitle] ||= []).push(e);
    });

    const assigned: any[] = [];
    Object.keys(groups).forEach((baseTitle) => {
      const variants = groups[baseTitle];
      if (variants.length === 1) return assigned.push(variants[0]);
      let hash = 0;
      const seed = `${email}::${baseTitle}`;
      for (let i = 0; i < seed.length; i++) {
        hash = (hash << 5) - hash + seed.charCodeAt(i);
        hash |= 0;
      }
      assigned.push(variants[Math.abs(hash) % variants.length]);
    });
    return assigned;
  }, [data.exams, email]);

  const submitExam = useCallback(
    async (e: any, endTime?: number) => {
      if (submittedRef.current.has(e.id)) return;
      submittedRef.current.add(e.id);
      const durMs = (Number(e.durationMinutes) || 45) * 60 * 1000;
      const startedAt = new Date((endTime ? endTime - durMs : Date.now() - durMs)).toISOString();
      const kq = await actRef.current({ action: "submitExam", examId: e.id, answers: answersRef.current[e.id] || {}, startedAt });

      // LỖI CŨ NGHIÊM TRỌNG: đánh dấu đã nộp NGAY LẬP TỨC, không chờ kết quả.
      // Rớt mạng một nhịp là học sinh bị khóa vĩnh viễn, không thể nộp lại -> mất trắng bài thi.
      if (!kq || kq.error) {
        submittedRef.current.delete(e.id);
        return;
      }

      // Nộp thành công thì dọn bài nháp đã lưu tạm, tránh phình bộ nhớ trình duyệt
      try {
        const conLai = { ...(answersRef.current || {}) };
        delete conLai[e.id];
        localStorage.setItem(ANSWER_KEY, JSON.stringify(conLai));
        const hanCu = safeParse<Record<string, number>>(localStorage.getItem(DEADLINE_KEY), {});
        delete hanCu[e.id];
        localStorage.setItem(DEADLINE_KEY, JSON.stringify(hanCu));
      } catch {}
    },
    [ANSWER_KEY, DEADLINE_KEY]
  );

  useEffect(() => {
    if (!currentExams.length) return;
    const savedDeadlines = safeParse<Record<string, number>>(localStorage.getItem(DEADLINE_KEY), {});
    const now = Date.now();
    const nextShuffle: Record<string, any[]> = {};
    const nextTimers: Record<string, number> = {};
    let shuffleChanged = false;
    let timerChanged = false;

    currentExams.forEach((e: any) => {
      if (!shuffledExams[e.id]) {
        const qs = (e.publicQuestions || []).map((q: any, idx: number) => ({ ...q, id: q?.id != null && String(q.id) !== "" ? String(q.id) : `q${idx + 1}` }));
        for (let i = qs.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [qs[i], qs[j]] = [qs[j], qs[i]];
        }
        nextShuffle[e.id] = qs;
        shuffleChanged = true;
      }
      if (!examTimers[e.id]) {
        nextTimers[e.id] = savedDeadlines[e.id] ?? now + (Number(e.durationMinutes) || 45) * 60 * 1000;
        timerChanged = true;
      }
    });

    if (shuffleChanged) setShuffledExams((prev) => ({ ...prev, ...nextShuffle }));
    if (timerChanged) {
      setExamTimers((prev) => {
        const merged = { ...prev, ...nextTimers };
        try { localStorage.setItem(DEADLINE_KEY, JSON.stringify(merged)); } catch {}
        return merged;
      });
    }
    if (shuffleChanged) triggerMath();
  }, [currentExams, DEADLINE_KEY, shuffledExams, examTimers, triggerMath]);

  useEffect(() => {
    if (active !== "Bài cần làm") return;

    let cooldown = false;

    const handleCheat = () => {
      if (cooldown || isConfirmingRef.current) return;
      
      let hasActiveExam = false;
      currentExams.forEach((e: any) => {
        const done = (data.attempts || []).some((a: any) => a.examId === e.id) || submittedRef.current.has(e.id);
        if (!done) hasActiveExam = true;
      });
      if (!hasActiveExam) return;

      cooldown = true;
      setTimeout(() => { cooldown = false; }, 1000);

      let showMsg = "";
      let autoSubmit = false;

      currentExams.forEach((e: any) => {
        const done = (data.attempts || []).some((a: any) => a.examId === e.id) || submittedRef.current.has(e.id);
        if (done) return;

        const count = (warnRef.current[e.id] || 0) + 1;
        warnRef.current = { ...warnRef.current, [e.id]: count };
        setWarnings({ ...warnRef.current });
        try { localStorage.setItem(WARN_KEY, JSON.stringify(warnRef.current)); } catch {}

        if (count >= 3) {
          submitExam(e, examTimers[e.id]);
          autoSubmit = true;
          showMsg = `🚨 BẠN ĐÃ CHUYỂN TAB QUÁ 3 LẦN!\n\nBài thi "${e.title}" của bạn đã bị hệ thống khóa và tự động nộp bài!`;
        } else if (!autoSubmit) {
          showMsg = `⚠️ CẢNH BÁO GIAN LẬN (${count}/3)\n\nBạn vừa chuyển tab hoặc rời khỏi màn hình làm bài!\n\nNghiêm cấm mọi hành vi tra cứu. Nếu vi phạm thêm ${3 - count} lần nữa bài thi sẽ bị thu tự động.`;
        }
      });

      if (showMsg) setWarningModal(showMsg);
    };

    // LỖI CŨ NGHIÊM TRỌNG: nghe sự kiện "blur" của window.
    // blur bắn cả khi học sinh bấm vào thanh địa chỉ, bấm ra ngoài cửa sổ, hoặc khi
    // chính hộp thoại alert/confirm của hệ thống hiện lên -> cảnh báo oan và có thể
    // TỰ THU BÀI của em không hề gian lận. Chỉ giữ visibilitychange (thật sự chuyển tab).
    const onVis = () => { if (document.hidden) handleCheat(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [active, currentExams, data.attempts, examTimers, submitExam, WARN_KEY]);

  const handleAnswerChange = useCallback(
    (examId: string, qId: string, val: string) => {
      setAnswers((prev: any) => {
        const updated = { ...prev, [examId]: { ...(prev[examId] || {}), [qId]: val } };
        try { localStorage.setItem(ANSWER_KEY, JSON.stringify(updated)); } catch {}
        return updated;
      });
    },
    [ANSWER_KEY, setAnswers]
  );

  if (active === "Lớp của em")
    return (
      <div>
        <form
          style={{ display: "flex", gap: "10px", marginBottom: "20px" }}
          onSubmit={(e) => {
            e.preventDefault();
            const code = join.trim();
            if (!code) return alert("Nhập mã lớp do giáo viên cung cấp.");
            act({ action: "joinClass", code });
            setJoin("");
          }}
        >
          <input value={join} onChange={(e) => setJoin(e.target.value.toUpperCase())} placeholder="Nhập MÃ LỚP do giáo viên cung cấp" style={{ flex: 1, padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none", maxWidth: "400px" }} />
          <button disabled={busy} style={{ background: "#10b981", color: "#fff", border: "none", padding: "0 24px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>Tham gia lớp</button>
        </form>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "20px" }}>
          {(data.classes || []).map((c: any) => (
            <article key={c.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "20px", display: "flex", gap: "16px", alignItems: "center" }}>
              <div style={{ width: "48px", height: "48px", background: "#f0fdf4", color: "#10b981", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "18px" }}>12</div>
              <div>
                <h3 style={{ margin: "0 0 4px 0", color: "#1e293b" }}>{c.name}</h3>
                <span style={{ fontSize: "13px", color: "#64748b" }}>Giáo viên quản lý</span>
              </div>
            </article>
          ))}
          {!(data.classes || []).length && <p style={{ color: "#64748b" }}>Bạn chưa tham gia lớp nào. Nhập mã lớp ở ô phía trên.</p>}
        </div>
      </div>
    );

  if (active === "Kết quả" || active === "Năng lực") {
    const list: any[] = data.attempts || [];
    const best = list.length ? Math.max(...list.map((a: any) => toScale10(a.score, a.maxScore))) : null;
    const mean = list.length ? list.reduce((s: number, a: any) => s + toScale10(a.score, a.maxScore), 0) / list.length : null;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
        <StatCard label="Bài đã nộp" value={list.length} />
        <StatCard label="Điểm cao nhất" value={best === null ? "—" : best.toFixed(1)} color="#10b981" />
        <StatCard label="Điểm trung bình" value={mean === null ? "—" : mean.toFixed(1)} color="#2563eb" />
      </div>
    );
  }

  return (
    <div>
      {warningModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999 }}>
          <div style={{ background: "#fff", padding: "30px", borderRadius: "12px", maxWidth: "450px", textAlign: "center", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.3)" }}>
            <h2 style={{ color: "#b91c1c", marginBottom: "15px", fontWeight: "900" }}>⚠️ HỆ THỐNG GIÁM SÁT</h2>
            <p style={{ fontSize: "16px", color: "#1e293b", marginBottom: "20px", whiteSpace: "pre-wrap", lineHeight: "1.5", fontWeight: "bold" }}>{warningModal}</p>
            <button style={{ background: "#1e3a8a", color: "#fff", border: "none", padding: "12px 24px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "15px" }} onClick={() => setWarningModal(null)}>Tôi đã hiểu và tiếp tục làm bài</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>
        {currentExams.map((e: any) => {
          const attempt = (data.attempts || []).find((a: any) => a.examId === e.id);
          const done = !!attempt;
          const questionsList = shuffledExams[e.id] || [];
          const endTime = examTimers[e.id];
          const warned = warnings[e.id] || 0;

          return (
            <article key={e.id} style={{ background: "#fff", padding: "30px", borderRadius: "16px", border: "1px solid #cbd5e1", width: "100%", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "2px solid #f1f5f9", paddingBottom: "12px", gap: "12px", flexWrap: "wrap" }}>
                <div>
                  <span style={{ fontSize: "14px", fontWeight: "bold", color: "#64748b", textTransform: "uppercase" }}>TOÁN 12 · {e.durationMinutes} phút</span>
                  <h2 style={{ fontSize: "22px", color: "#1e3a8a", marginTop: "4px", marginBottom: "4px" }}>{e.title}</h2>
                  <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>Mã đề riêng của bạn: <b>{e.code}</b>{warned > 0 && !done ? <span style={{color: "#b91c1c", fontWeight: "bold"}}> · Cảnh báo {warned}/3</span> : ""}</p>
                </div>
                {!done && endTime && <ExamTimer endTime={endTime} onTimeOut={() => {
                   isConfirmingRef.current = true;
                   alert("Đã hết thời gian làm bài! Hệ thống sẽ tự động thu bài của bạn.");
                   submitExam(e, endTime);
                   setTimeout(() => { isConfirmingRef.current = false; }, 1000);
                }} />}
              </div>

              {done ? (
                <div style={{ padding: "24px", background: "#f0fdf4", borderRadius: "12px", border: "1px solid #bbf7d0", marginTop: "15px", textAlign: "center" }}>
                  <div style={{ fontSize: "18px", fontWeight: "bold", color: "#166534", marginBottom: "8px" }}>✓ Đã nộp bài</div>
                  <p style={{ fontSize: "16px", color: "#15803d", margin: 0 }}>Kết quả: <b>{attempt.score} / {attempt.maxScore}</b> ({fmt10(attempt.score, attempt.maxScore)} điểm)</p>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: "13px", color: "#0ea5e9", marginBottom: "20px", background: "#f0f9ff", padding: "10px 14px", borderRadius: "8px", border: "1px solid #bae6fd" }}>
                    💾 Cứ yên tâm làm bài nhé! Câu trả lời của bạn được sao lưu liên tục trên máy.
                  </div>

                  {questionsList.map((q: any, i: number) => (
                    <StudentQuestionItem key={q.id} q={q} i={i} examId={e.id} answerValue={answers[e.id]?.[q.id] || ""} onAnswerChange={handleAnswerChange} />
                  ))}

                  <button
                    style={{ width: "100%", marginTop: "20px", background: "#1e3a8a", padding: "16px", fontSize: "18px", fontWeight: "bold", borderRadius: "10px", cursor: "pointer", color: "#fff", border: "none" }}
                    disabled={busy || questionsList.length === 0}
                    onClick={() => {
                      isConfirmingRef.current = true;
                      
                      const answered = Object.keys(answers[e.id] || {}).length;
                      const missing = questionsList.length - answered;
                      const msg = missing > 0 ? `Bạn còn ${missing} câu chưa trả lời.\n\nBạn có CHẮC CHẮN muốn nộp bài?` : "Bạn đã sẵn sàng nộp bài?\n\n(Lưu ý: Sau khi nộp sẽ không thể thay đổi đáp án nữa)";
                      
                      if (confirm(msg)) {
                        submitExam(e, endTime);
                      }
                      
                      setTimeout(() => { isConfirmingRef.current = false; }, 1000);
                    }}
                  >
                    Nộp bài an toàn
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {currentExams.length === 0 && <p style={{ color: "#64748b", textAlign: "center", padding: "40px" }}>Chưa có bài kiểm tra nào cần làm.</p>}
      </div>
    </div>
  );
}

// ==========================================
// THÀNH PHẦN PHỤ
// ==========================================
function Results({ rows, exams, classes, act, busy }: any) {
  const examById = useMemo(() => {
    const m: Record<string, any> = {};
    (exams || []).forEach((e: any) => (m[e.id] = e));
    return m;
  }, [exams]);

  const classById = useMemo(() => {
    const m: Record<string, any> = {};
    (classes || []).forEach((c: any) => (m[c.id] = c));
    return m;
  }, [classes]);

  return (
    <div style={{ overflowX: "auto", background: "#fff", borderRadius: "12px", border: "1px solid #cbd5e1" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
        <thead style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
          <tr>
            <th style={{ padding: "16px", color: "#475569" }}>Học sinh</th>
            <th style={{ padding: "16px", color: "#475569" }}>Lớp</th>
            <th style={{ padding: "16px", color: "#475569" }}>Mã đề</th>
            <th style={{ padding: "16px", color: "#475569" }}>Điểm</th>
            <th style={{ padding: "16px", color: "#475569" }}>Nộp lúc</th>
            <th style={{ padding: "16px", color: "#475569", textAlign: "right" }}>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a: any) => {
            const ex = examById[a.examId];
            const cls = ex ? classById[ex.classId] : null;
            return (
              <tr key={a.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "16px" }}><b style={{ color: "#0f172a" }}>{a.studentName}</b><br /><small style={{ color: "#64748b" }}>{a.studentEmail}</small></td>
                <td style={{ padding: "16px" }}><span style={{ background: "#e0f2fe", color: "#0369a1", padding: "6px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: "bold" }}>{cls ? cls.name : "Không rõ"}</span></td>
                <td style={{ padding: "16px", color: "#3b82f6", fontWeight: "bold" }}>{ex?.code || a.examId}</td>
                <td style={{ padding: "16px", fontSize: "16px" }}><b>{fmt10(a.score, a.maxScore)}</b></td>
                <td style={{ padding: "16px", color: "#64748b", fontSize: "14px" }}>{a.submittedAt ? new Date(a.submittedAt).toLocaleString("vi-VN") : "—"}</td>
                <td style={{ padding: "16px", textAlign: "right" }}>
                  <button
                    style={{ background: "#fee2e2", color: "#b91c1c", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "bold" }}
                    disabled={busy}
                    onClick={() => { if (confirm(`Xóa bài nộp của ${a.studentName}? Hành động không thể hoàn tác.`)) act({ action: "deleteAttempt", attemptId: a.id }); }}
                  >
                    Xóa
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && <p style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>Chưa có bài nộp nào.</p>}
    </div>
  );
}

// ==========================================
// XUẤT DỮ LIỆU
// ==========================================
const escapeHtml = (v: any) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

function buildRows(rows: any[], exams: any[]) {
  const examById: Record<string, any> = {};
  (exams || []).forEach((e: any) => (examById[e.id] = e));
  return rows
    .map((a) => {
      const ex = examById[a.examId];
      return `<tr><td>${escapeHtml(a.studentName)}</td><td>${escapeHtml(a.studentEmail)}</td><td>${escapeHtml(ex?.code || a.examId)}</td><td>${fmt10(a.score, a.maxScore)}</td><td>${a.submittedAt ? new Date(a.submittedAt).toLocaleString("vi-VN") : ""}</td></tr>`;
    })
    .join("");
}

const HEAD_ROW = "<tr><th>Học sinh</th><th>Email</th><th>Mã đề</th><th>Điểm (hệ 10)</th><th>Thời gian nộp</th></tr>";

function exportExcel(rows: any[], exams: any[]) {
  if (!rows.length) return alert("Chưa có dữ liệu để xuất.");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><table border="1"><thead>${HEAD_ROW}</thead><tbody>${buildRows(rows, exams)}</tbody></table></body></html>`;
  download(["\ufeff", html], "application/vnd.ms-excel", "Ket_qua_V17.xls");
}

function exportDoc(rows: any[], exams: any[]) {
  if (!rows.length) return alert("Chưa có dữ liệu để xuất.");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>Bang diem</title></head><body><h2 style="text-align:center;">BẢNG ĐIỂM KẾT QUẢ TỔNG HỢP</h2><table border="1" style="border-collapse:collapse;width:100%;text-align:center;" cellpadding="5"><thead style="background-color:#f1f5f9;">${HEAD_ROW}</thead><tbody>${buildRows(rows, exams)}</tbody></table></body></html>`;
  download(["\ufeff", html], "application/msword", "Ket_qua_V17.doc");
}

function printPdf(rows: any[], exams: any[]) {
  if (!rows.length) return alert("Chưa có dữ liệu để in.");
  const html = `<html><head><meta charset="utf-8"><title>Bảng điểm</title><style>body{font-family:Arial,sans-serif;padding:20px;}table{border-collapse:collapse;width:100%;margin-top:20px;}th,td{border:1px solid #000;padding:10px;text-align:left;}th{background-color:#f1f5f9;}</style></head><body><h2 style="text-align:center;">BẢNG ĐIỂM KẾT QUẢ TỔNG HỢP</h2><table><thead>${HEAD_ROW}</thead><tbody>${buildRows(rows, exams)}</tbody></table></body></html>`;
  const win = window.open("", "_blank");
  if (!win) return alert("Trình duyệt đang chặn pop-up. Hãy cho phép pop-up rồi thử lại.");
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

// ==========================================
// ĐĂNG NHẬP
// ==========================================
export function LoginForm({ onLogin }: any) {
  const [name, setName] = useState("");
  const [classCode, setClassCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const finalName = name.trim().replace(/\s+/g, " ");
    const rawClass = classCode.trim().toUpperCase();

    if (finalName.split(" ").length < 2) {
      setError("❌ Họ và tên phải có từ 2 chữ trở lên (ví dụ: Hồ Thuyết Dũng).");
      return;
    }
    if (/\d/.test(finalName)) {
      setError("❌ Họ và tên không được chứa số.");
      return;
    }
    const isCapitalized = finalName.split(" ").every((w) => w.length > 0 && w[0] === w[0].toLocaleUpperCase("vi-VN") && w[0] !== w[0].toLocaleLowerCase("vi-VN"));
    if (!isCapitalized) {
      setError("❌ Viết hoa chữ cái đầu của mỗi từ trong tên (ví dụ: Hồ Thuyết Dũng).");
      return;
    }
    if (!/^(1[0-2]|[6-9])[A-Z]{1,5}\d{0,3}$/.test(rawClass)) {
      setError("❌ Mã lớp không hợp lệ. Ví dụ đúng: 12A01, 11A1, 10CT2.");
      return;
    }

    setBusy(true);
    try {
      const cleanName = finalName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").replace(/\s+/g, "").toLowerCase();
      const finalEmail = `${cleanName}.${rawClass.toLowerCase()}@student.v17`;

      const formData = new FormData();
      formData.append("email", finalEmail);
      formData.append("name", finalName);
      formData.append("roleType", "student");

      const res = await onLogin(formData);
      if (res?.error) setError(res.error);
    } catch {
      setError("❌ Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
    } finally {
      setBusy(false);
    }
  };

  const handleTeacherLogin = async () => {
    setError("");
    if (!password) {
      setError("❌ Nhập mật khẩu giáo viên vào ô bên trên trước khi bấm nút.");
      return;
    }
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("email", TEACHER_ACCOUNT.email);
      formData.append("name", TEACHER_ACCOUNT.name);
      formData.append("roleType", "teacher");
      formData.append("password", password);
      const res = await onLogin(formData);
      if (res?.error) setError(res.error);
    } catch {
      setError("❌ Không kết nối được máy chủ.");
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = () => {
    // Mật khẩu không còn khôi phục qua cookie (học sinh có thể lợi dụng).
    // Quản trị viên đặt lại mật khẩu gốc trong Cloudflare.
    alert(
      "Cách lấy lại mật khẩu Giáo viên:\n\n" +
        "1. Đăng nhập dash.cloudflare.com (tài khoản quản trị).\n" +
        "2. Workers & Pages → v17-dinhcaotritue → Settings → Variables and Secrets.\n" +
        "3. Sửa biến bí mật TEACHER_PASSWORD thành mật khẩu mới rồi bấm Deploy.\n\n" +
        "Sau đó đăng nhập bằng mật khẩu mới vừa đặt."
    );
  };

  return (
    <main className="signin" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", padding: "20px" }}>
      <div className="signin-card" style={{ background: "#fff", padding: "50px 40px", borderRadius: "24px", width: "100%", maxWidth: "680px", textAlign: "center", boxShadow: "0 20px 40px rgba(0,0,0,0.3)" }}>
        <div className="brand-mark" style={{ width: "56px", height: "56px", background: "#fbbf24", color: "#1e3a8a", fontSize: "28px", fontWeight: "bold", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "16px", margin: "0 auto 24px" }}>Đ</div>
        <p className="eyebrow" style={{ fontSize: "13px", fontWeight: "bold", color: "#64748b", letterSpacing: "1.5px", margin: "0 0 10px", textTransform: "uppercase" }}>ĐỈNH CAO TRÍ TUỆ</p>
        <h1 style={{ fontSize: "32px", color: "#1e3a8a", margin: "0 0 12px" }}>ỨNG DỤNG HỌC VÀ THI ONLINE</h1>
        <p style={{ color: "#64748b", fontSize: "16px", margin: "0 0 32px" }}>Đăng nhập bằng họ tên và mã lớp. Phiên đăng nhập được mã hóa.</p>

        {error && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "14px", borderRadius: "10px", marginBottom: "20px", fontWeight: "bold", border: "1px solid #fca5a5" }}>{error}</div>}

        <div style={{ display: "flex", gap: "16px", marginTop: "20px", marginBottom: "20px", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 250px", display: "flex", flexDirection: "column", gap: "10px", background: "#f8fafc", padding: "20px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleTeacherLogin(); }}
              placeholder="Nhập mật khẩu Giáo viên..."
              style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "15px", textAlign: "center", outline: "none", background: "#fff" }}
            />
            <button type="button" onClick={handleTeacherLogin} disabled={busy} style={{ width: "100%", padding: "14px", background: "#eff6ff", color: "#1e3a8a", border: "2px solid #1e3a8a", borderRadius: "10px", fontWeight: "bold", fontSize: "16px", cursor: busy ? "not-allowed" : "pointer" }}>👨‍🏫 Quản Trị</button>
          </div>

          <div style={{ flex: "1 1 250px", display: "flex", flexDirection: "column", gap: "10px", background: "#fef2f2", padding: "20px", borderRadius: "16px", border: "1px solid #fca5a5" }}>
            <div style={{ height: "46px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", color: "#b91c1c", fontWeight: "bold" }}>Quên mật khẩu Giáo viên?</div>
            <button type="button" onClick={handleForgotPassword} disabled={busy} style={{ width: "100%", padding: "14px", background: "#fff", color: "#b91c1c", border: "2px solid #b91c1c", borderRadius: "10px", fontWeight: "bold", fontSize: "16px", cursor: busy ? "not-allowed" : "pointer" }}>🔑 Quên mật khẩu</button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", margin: "24px 0" }}>
          <hr style={{ flex: 1, border: "none", borderTop: "1px solid #cbd5e1" }} />
          <span style={{ padding: "0 16px", color: "#64748b", fontSize: "15px", fontWeight: "bold", textTransform: "uppercase" }}>ĐĂNG NHẬP DÀNH CHO HỌC SINH</span>
          <hr style={{ flex: 1, border: "none", borderTop: "1px solid #cbd5e1" }} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px", margin: "10px 0 20px" }}>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="1. Họ và tên (viết hoa chữ cái đầu)" required style={{ padding: "16px", borderRadius: "10px", border: "1px solid #cbd5e1", color: "#0f172a", fontSize: "16px", outline: "none", background: "#f8fafc" }} />
          <input type="text" value={classCode} onChange={(e) => setClassCode(e.target.value.toUpperCase())} placeholder="2. Mã lớp (ví dụ: 12A01)" required style={{ padding: "16px", borderRadius: "10px", border: "1px solid #cbd5e1", color: "#0f172a", fontSize: "16px", outline: "none", background: "#f8fafc" }} />
          <button type="submit" disabled={busy} className="primary-btn" style={{ background: "#1e3a8a", color: "#fff", cursor: busy ? "not-allowed" : "pointer", border: "none", width: "100%", fontSize: "18px", padding: "16px", borderRadius: "10px", fontWeight: "bold", marginTop: "8px" }}>
            {busy ? "Đang kiểm tra dữ liệu..." : "Vào lớp học ngay"}
          </button>
        </form>

        <div className="trust-row" style={{ display: "flex", justifyContent: "center", gap: "20px", marginTop: "30px", fontSize: "14px", color: "#64748b", fontWeight: "bold" }}>
          <span>🔒 SSL/TLS</span>
          <span>✓ HttpOnly</span>
          <span>✓ Dữ liệu chuẩn hóa</span>
        </div>
      </div>
    </main>
  );
}