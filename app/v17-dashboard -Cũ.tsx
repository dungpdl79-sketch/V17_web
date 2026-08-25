/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
"use client";
import { useEffect, useState, useRef, memo } from "react";

type Data = {
  user: { email: string; name: string; role: "teacher" | "student" | null };
  classes: any[];
  exams: any[];
  attempts: any[];
};

const T = ["Tổng quan", "Lớp học", "Studio đề", "Quản lý bài phát", "Nhúng link", "Kết quả", "Sao lưu"];
const S = ["Bài cần làm", "Lớp của em", "Kết quả", "Năng lực"];

const MathText = memo(function MathText({ html, style, className }: { html: string; style?: React.CSSProperties; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let isMounted = true;
    const tryTypeset = () => {
      if (!isMounted) return;
      const MathJax = (window as any).MathJax;
      if (MathJax && typeof MathJax.typesetPromise === "function") {
        if (ref.current) {
          if (ref.current.innerHTML !== html) ref.current.innerHTML = html;
          MathJax.typesetPromise([ref.current]).catch(() => {});
        }
      } else {
        setTimeout(tryTypeset, 200);
      }
    };
    tryTypeset();
    return () => { isMounted = false; };
  }, [html]);

  return <span ref={ref} style={style} className={className} />;
}, (prev, next) => prev.html === next.html);

const StudentOptionItem = memo(function StudentOptionItem({ o, j, examId, qId, isChecked, onAnswerChange }: any) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: "12px", cursor: "pointer", background: isChecked ? "#eff6ff" : "#fff", padding: "10px 14px", borderRadius: "8px", border: "1px solid", borderColor: isChecked ? "#3b82f6" : "#cbd5e1", transition: "background 0.15s ease, border-color 0.15s ease" }}>
      <input type="radio" name={`${examId}-${qId}`} style={{ marginTop: "4px", width: "18px", height: "18px", accentColor: "#2563eb" }} checked={isChecked} onChange={() => onAnswerChange(examId, qId, String(j))} />
      <MathText html={`<b>${String.fromCharCode(65 + j)}.</b> ${o}`} style={{ fontSize: "16px", lineHeight: "1.5" }} />
    </label>
  );
}, (prev, next) => prev.isChecked === next.isChecked && prev.o === next.o);

const StudentQuestionItem = memo(function StudentQuestionItem({ q, i, examId, answerValue, onAnswerChange }: any) {
  return (
    <div style={{ marginBottom: "28px", padding: "20px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
      <div style={{ fontSize: "17px", fontWeight: "bold", color: "#1e293b", marginBottom: "16px", lineHeight: "1.6" }}>Câu {i + 1}. <MathText html={q.q || ""} /></div>
      {q.type === "mcq" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginLeft: "10px" }}>
          {(q.opts || []).map((o: string, j: number) => (
            <StudentOptionItem key={j} o={o} j={j} examId={examId} qId={q.id} isChecked={answerValue === String(j)} onAnswerChange={onAnswerChange} />
          ))}
        </div>
      ) : (
        <input style={{ width: "100%", maxWidth: "400px", padding: "14px", marginTop: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "16px", background: "#fff" }} placeholder="Nhập câu trả lời của bạn..." value={answerValue || ""} onChange={(x) => onAnswerChange(examId, q.id, x.target.value)} />
      )}
    </div>
  );
}, (prev, next) => prev.answerValue === next.answerValue && prev.q === next.q);

function ExamTimer({ endTime, onTimeOut }: any) {
  const [timeLeft, setTimeLeft] = useState("");
  useEffect(() => {
    const interval = setInterval(() => {
      const diff = endTime - Date.now();
      if (diff <= 0) {
        setTimeLeft("00:00 (Hết giờ)");
        clearInterval(interval);
        onTimeOut();
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [endTime]);
  return <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "8px 16px", borderRadius: "8px", fontWeight: "bold", fontSize: "16px", border: "1px solid #fca5a5" }}>⏱️ Còn lại: {timeLeft || "45:00"}</div>;
}

export default function Dashboard({ initialUser, logoutAction, changePasswordAction, resetPasswordAction }: any) {
  const [data, setData] = useState<Data>({ user: { ...initialUser, role: initialUser.role || null }, classes: [], exams: [], attempts: [] });
  const [active, setActive] = useState("Tổng quan");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});

  const act = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await fetch("/api/v17", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      setNote(r.ok ? (j.score !== undefined ? `Đã nộp: ${j.score}/${j.maxScore} điểm.` : "Đã thao tác thành công.") : j.error);
      if (r.ok) await load();
    } catch (e) { setNote("Đã xảy ra lỗi mạng."); }
    setBusy(false);
  };

  const load = async () => {
    try {
      const r = await fetch("/api/v17", { cache: "no-store" });
      const j = await r.json();
      if (r.ok) {
        if (initialUser.role && j.user.role !== initialUser.role) {
          act({ action: "setRole", role: initialUser.role, name: initialUser.name });
          return;
        }
        setData(j);
        if (j.user.role === "student" && active === "Tổng quan") setActive("Bài cần làm");
      } else {
        setNote(j.error);
      }
    } catch (e) { setNote("Không thể kết nối đến máy chủ."); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!document.getElementById("mathjax-script")) {
      (window as any).MathJax = { tex: { inlineMath: [['$', '$'], ['\\(', '\\)']], displayMath: [['$$', '$$'], ['\\[', '\\]']] }, startup: { typeset: false } };
      const script = document.createElement("script");
      script.id = "mathjax-script";
      script.src = "https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-mml-chtml.js";
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  const triggerMath = () => {
    setTimeout(() => {
      if ((window as any).MathJax?.typesetPromise) (window as any).MathJax.typesetPromise().catch(() => {});
      if ((window as any).MathViz?.renderAll) (window as any).MathViz.renderAll();
    }, 100);
  };
  useEffect(() => { triggerMath(); }, [active, data]);

  if (!data.user.role) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#1e3a8a", fontWeight: "bold", fontSize: "18px" }}>Đang đồng bộ phân quyền an toàn...</div>;

  const teacher = data.user.role === "teacher";
  const menu = teacher ? T : S;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo"><b>Đ</b><span>Đỉnh Cao<br /><small>TRÍ TUỆ V17</small></span></div>
        <nav>{menu.map((x) => <button key={x} className={active === x ? "active" : ""} onClick={() => setActive(x)}><i>{icon[x]}</i>{x}</button>)}</nav>
        <div className="side-footer">
          <div className="avatar">{data.user.name[0]}</div>
          <div><b>{data.user.name}</b><small>{teacher ? "Giáo viên" : "Học sinh"}</small></div>
          <div style={{ display: "flex", gap: "6px", marginLeft: "auto" }}>
            <button
              title="Đăng xuất khỏi hệ thống"
              style={{ background: "#ef4444", color: "#fff", border: "none", cursor: "pointer", fontSize: "0.85em", padding: "6px 14px", borderRadius: "6px", fontWeight: "bold" }}
              onClick={async () => {
                if (logoutAction) { await logoutAction(); window.location.href = "/"; }
              }}
            >Đăng xuất</button>
          </div>
        </div>
      </aside>
      <main className="workspace">
        <header>
          <div><p className="eyebrow">NĂM HỌC 2026–2027</p><h1>{active}</h1></div>
          <div className="header-actions"><span>● Đã đồng bộ</span><button onClick={() => window.print()}>Xuất PDF</button></div>
        </header>
        {note && <div className="notice">{note}<button onClick={() => setNote("")}>×</button></div>}
        {teacher ? (
          <Teacher active={active} data={data} busy={busy} act={act} triggerMath={triggerMath} changePasswordAction={changePasswordAction} resetPasswordAction={resetPasswordAction} />
        ) : (
          <Student active={active} data={data} busy={busy} act={act} answers={answers} setAnswers={setAnswers} triggerMath={triggerMath} />
        )}
      </main>
    </div>
  );
}

function Teacher({ active, data, busy, act, triggerMath, changePasswordAction, resetPasswordAction }: any) {
  const [name, setName] = useState("");
  const [exam, setExam] = useState({ title: "Kiểm tra nhanh Toán 12", classId: "", duration: 45, showScore: true });
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewMeta, setPreviewMeta] = useState<any>(null);
  const [editQ, setEditQ] = useState<any>(null);
  const [selectedClassToDelete, setSelectedClassToDelete] = useState(""); 

  const [links, setLinks] = useState<{name: string, url: string}[]>([]);
  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");

  const avg = (data.attempts || []).length ? (data.attempts || []).reduce((s: number, a: any) => s + (a.score / a.maxScore) * 10, 0) / (data.attempts || []).length : 0;

  useEffect(() => { if (previewData) triggerMath(); }, [previewData, editQ]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("v17_teacher_links");
      if (saved) setLinks(JSON.parse(saved));
    } catch(e){}
  }, []);

  const saveLinks = (newLinks: any[]) => {
    setLinks(newLinks);
    try { localStorage.setItem("v17_teacher_links", JSON.stringify(newLinks)); } catch(e){}
  };

  const getQuestionsFromJSON = (json: any): any[] => {
    if (!json) return [];
    if (Array.isArray(json)) return json;
    if (json.questions && Array.isArray(json.questions)) return json.questions;
    if (json.data && Array.isArray(json.data)) return json.data;
    for (const key in json) { if (Array.isArray(json[key])) return json[key]; }
    return [];
  };

  const updateQuestionsInJSON = (originalJson: any, newQs: any[]) => {
    if (Array.isArray(originalJson)) return newQs;
    if (originalJson.questions) return { ...originalJson, questions: newQs };
    if (originalJson.data) return { ...originalJson, data: newQs };
    for (const key in originalJson) { if (Array.isArray(originalJson[key])) return { ...originalJson, [key]: newQs }; }
    return { ...originalJson, questions: newQs };
  };

  const previewQs = getQuestionsFromJSON(previewData);

  if (active === "Studio đề" && previewData) {
    return (
      <Page title="👀 Kiểm duyệt & Cấu hình số lượng đề" sub={`Kiểm tra lại đề "${previewMeta.title}" trước khi phát.`}>
        <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1" }}>
          <div style={{ marginBottom: "20px", padding: "16px", background: "#f1f5f9", borderRadius: "8px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontWeight: "bold", color: "#1e3a8a" }}>
              <input type="checkbox" checked={previewMeta.showScore} onChange={(e) => setPreviewMeta({...previewMeta, showScore: e.target.checked})} style={{ width: "18px", height: "18px" }} />
              🔓 Cho phép học sinh xem điểm & đáp án ngay sau khi nộp bài
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "15px", flexWrap: "wrap" }}>
              <span style={{ fontWeight: "bold", color: "#334155" }}>🔢 Số lượng mã đề cần tạo (ví dụ sĩ số lớp 45):</span>
              <input type="number" min="1" max="100" value={previewMeta.numVersions || 45} onChange={(e) => setPreviewMeta({...previewMeta, numVersions: parseInt(e.target.value) || 1})} style={{ width: "120px", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "16px", fontWeight: "bold", color: "#1e3a8a" }} />
              <span style={{ fontSize: "13px", color: "#64748b" }}>(Hệ thống tự động sinh ra từng đề riêng biệt)</span>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <h3 style={{ margin: 0 }}>Danh sách câu hỏi gốc ({previewQs.length} câu)</h3>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <a href="/v15.html" target="_blank" style={{ padding: "10px 16px", borderRadius: "8px", border: "none", background: "#10b981", color: "#fff", fontWeight: "bold", textDecoration: "none", display: "flex", alignItems: "center", cursor: "pointer" }}>
                ➕ NẠP / SỬA CÂU HỎI
              </a>
              <button onClick={() => setPreviewData(null)} style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc", cursor: "pointer" }}>Hủy bỏ</button>
              <button className="primary-btn" disabled={busy || previewQs.length === 0} onClick={() => {
                  act({ action: "importJsonExam", classId: previewMeta.classId, duration: previewMeta.duration, title: previewMeta.title, showScore: previewMeta.showScore, numVersions: previewMeta.numVersions || 45, jsonData: previewData });
                  setPreviewData(null);
                }}>🚀 Xác nhận Phát bài ngay ({previewMeta.numVersions || 45} mã đề)</button>
            </div>
          </div>

          {previewQs.map((q: any, i: number) => (
            <div key={q.id || i} style={{ marginBottom: "20px", padding: "16px", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              {editQ?.id === q.id ? (
                <div>
                  <textarea value={editQ.q} onChange={(e) => setEditQ({...editQ, q: e.target.value})} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", minHeight: "100px", marginBottom: "10px" }} />
                  {editQ.type === 'mcq' && (editQ.opts || []).map((opt: string, oIdx: number) => (
                    <div key={oIdx} style={{ display: "flex", gap: "10px", marginBottom: "8px" }}>
                      <span style={{ fontWeight: "bold", width: "24px", paddingTop: "8px" }}>{String.fromCharCode(65 + oIdx)}.</span>
                      <textarea value={opt} onChange={(e) => { const newOpts = [...(editQ.opts || [])]; newOpts[oIdx] = e.target.value; setEditQ({...editQ, opts: newOpts}); }} style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", minHeight: "40px" }} />
                    </div>
                  ))}
                  <div style={{ marginTop: "10px", display: "flex", gap: "10px" }}>
                    <button onClick={() => {
                      const newQs = previewQs.map((oldQ: any) => oldQ.id === editQ.id ? editQ : oldQ);
                      setPreviewData(updateQuestionsInJSON(previewData, newQs));
                      setEditQ(null);
                    }} style={{ padding: "8px 16px", background: "#10b981", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}>Lưu chỉnh sửa</button>
                    <button onClick={() => setEditQ(null)} style={{ padding: "8px 16px", background: "#cbd5e1", border: "none", borderRadius: "6px", cursor: "pointer" }}>Hủy sửa</button>
                  </div>
                </div>
              ) : (
                <div>
                  <b style={{ display: "block", marginBottom: "12px", fontSize: "1.05em", color: "#1e293b" }}>Câu {i + 1}. <MathText html={q.q || ""} /></b>
                  {q.type === "mcq" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginLeft: "10px", marginBottom: "16px" }}>
                      {(q.opts || []).map((o: string, j: number) => <MathText key={j} html={`${String.fromCharCode(65 + j)}. ${o}`} />)}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button onClick={() => setEditQ(JSON.parse(JSON.stringify(q)))} style={{ padding: "6px 12px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>✏️ Sửa câu này</button>
                    <button onClick={() => {
                      if (confirm("Chắc chắn muốn xóa câu này khỏi đề?")) {
                        const newQs = previewQs.filter((oldQ: any) => oldQ.id !== q.id);
                        setPreviewData(updateQuestionsInJSON(previewData, newQs));
                      }
                    }} style={{ padding: "6px 12px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}>🗑️ Xóa câu này</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Page>
    );
  }

  if (active === "Nhúng link") {
    return (
      <Page title="Tác vụ nhúng link" sub="Quản lý và lưu trữ các đường link công việc (VD: Link học Google Meet, Zoom, Drive tài liệu...)">
        <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1", marginBottom: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
          <h3 style={{ marginTop: 0, color: "#1e3a8a" }}>➕ Thêm liên kết mới</h3>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
            <input 
              placeholder="Tên liên kết (vd: Phòng Google Meet khối 12)" 
              value={newLinkName} onChange={e => setNewLinkName(e.target.value)}
              style={{ flex: "1 1 200px", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none" }}
            />
            <input 
              placeholder="Đường dẫn URL (vd: https://meet.google.com/...)" 
              value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)}
              style={{ flex: "2 1 300px", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", outline: "none" }}
            />
            <button 
              style={{ background: "#10b981", color: "#fff", border: "none", padding: "12px 24px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
              onClick={() => {
                if(newLinkName.trim() && newLinkUrl.trim()) {
                  saveLinks([...links, { name: newLinkName.trim(), url: newLinkUrl.trim() }]);
                  setNewLinkName(""); setNewLinkUrl("");
                } else {
                  alert("Vui lòng nhập đầy đủ tên và đường dẫn URL!");
                }
              }}
            >
              Thêm Link
            </button>
          </div>
        </div>

        <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
          <h3 style={{ marginTop: 0, color: "#1e3a8a" }}>🔗 Danh sách liên kết đã lưu</h3>
          {links.length === 0 && <p style={{ color: "#64748b" }}>Chưa có liên kết nào được thêm.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
            {links.map((lnk, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <b style={{ color: "#0f172a", fontSize: "16px" }}>{lnk.name}</b>
                  <br/>
                  <a href={lnk.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "14px", color: "#3b82f6", textDecoration: "none", wordBreak: "break-all" }}>{lnk.url}</a>
                </div>
                <button 
                  style={{ background: "#fee2e2", color: "#b91c1c", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" }}
                  onClick={() => {
                    if(confirm(`Bạn có chắc muốn xóa liên kết "${lnk.name}"?`)) {
                      saveLinks(links.filter((_, i) => i !== idx));
                    }
                  }}
                >
                  🗑️ Xóa
                </button>
              </div>
            ))}
          </div>
        </div>
      </Page>
    );
  }

  if (active === "Lớp học")
    return (
      <Page title="Danh sách lớp" sub="Tạo mã lớp để học sinh tham gia trên mọi thiết bị.">
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); act({ action: "createClass", name }); setName(""); }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ví dụ: Toán 12A09" />
          <button disabled={busy}>＋ Tạo lớp</button>
        </form>
        <div className="card-grid">
          {(data.classes || []).map((c: any) => (
            <article className="class-card" key={c.id} style={{ position: "relative" }}>
              <div className="class-icon">12</div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <h3 style={{ margin: "0 0 4px 0" }}>{c.name}</h3>
                  <button 
                    title="Xóa lớp học này"
                    style={{ background: "#fee2e2", color: "#b91c1c", border: "none", padding: "6px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "14px", transition: "0.2s" }}
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Bạn có chắc chắn muốn xóa lớp "${c.name}"? Mọi dữ liệu đề thi và bảng điểm liên quan có thể bị ảnh hưởng.`)) {
                        act({ action: "deleteClass", classId: c.id });
                      }
                    }}
                  >
                    🗑️ Xóa lớp
                  </button>
                </div>
                <p>{c.students} học sinh · {c.schoolYear}</p>
                <span>Mã lớp: <b>{c.code}</b></span>
              </div>
            </article>
          ))}
          {!(data.classes || []).length && <Empty text="Chưa có lớp học." />}
        </div>
      </Page>
    );

  if (active === "Studio đề")
    return (
      <Page title="Studio thiết kế và phát đề" sub="Tải file JSON từ Đỉnh Cao Trí Tuệ V15 để phát trực tiếp lên đây cho học sinh.">
        <div className="studio">
          <div className="steps">
            {["Chọn lớp", "Cấu trúc", "Ma trận", "Thang điểm", "Kiểm duyệt", "Phát bài"].map((x, i) => (
              <div className={i === 4 ? "step active" : "step"} key={x}><b>{i + 1}</b>{x}</div>
            ))}
          </div>
          <div className="studio-form">
            <a href="/v15.html" target="_blank" className="primary-btn" style={{ display: "block", textAlign: "center", textDecoration: "none", marginBottom: "16px", background: "#8b5cf6" }}>🚀 Mở xưởng soạn đề Đỉnh Cao Trí Tuệ (Bản gốc)</a>
            <hr style={{ margin: "16px 0", borderColor: "#e2e8f0" }} />
            <h3>📥 Nạp file đề từ V15 để kiểm duyệt</h3>
            <label>Chọn lớp
              <select value={exam.classId} onChange={(e) => setExam({ ...exam, classId: e.target.value })}>
                <option value="">— Chọn lớp —</option>
                {(data.classes || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>Thời gian làm bài (phút)
              <input type="number" value={exam.duration} onChange={(e) => setExam({ ...exam, duration: +e.target.value })} />
            </label>
            <label>Tải file sao lưu (.json) từ V15
              <input type="file" accept=".json" id="json-exam-file" style={{ padding: "10px", border: "2px dashed #cbd5e1", borderRadius: "8px", background: "#f8fafc", cursor: "pointer" }} />
            </label>
            <button className="primary-btn" disabled={!exam.classId || busy} onClick={() => {
                const f = (document.getElementById("json-exam-file") as HTMLInputElement)?.files?.[0];
                if (!f) return alert("Hãy chọn file .json từ Đỉnh Cao Trí Tuệ V15 trước.");
                const r = new FileReader();
                r.onload = (e) => {
                  try {
                    const jsonData = JSON.parse(e.target?.result as string);
                    setPreviewData(jsonData);
                    setPreviewMeta({ classId: exam.classId, duration: exam.duration, title: f.name.replace(/\.[^/.]+$/, ""), showScore: true, numVersions: 45 });
                  } catch (err) { alert("File JSON bị lỗi định dạng cấu trúc."); }
                };
                r.readAsText(f);
              }}>👀 Tải lên & Kiểm duyệt nội dung</button>
          </div>
        </div>
      </Page>
    );

  if (active === "Kết quả") return (
    <Page title="Bảng kết quả" sub="Dữ liệu nộp từ mọi thiết bị.">
      <div style={{ marginBottom: "20px", display: "flex", gap: "10px", alignItems: "center", background: "#fef2f2", padding: "16px", borderRadius: "12px", border: "1px solid #fca5a5", flexWrap: "wrap" }}>
        <span style={{ fontWeight: "bold", color: "#b91c1c" }}>🗑️ Xóa kết quả theo lớp:</span>
        <select 
          value={selectedClassToDelete} 
          onChange={(e) => setSelectedClassToDelete(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #f87171", outline: "none", flex: "1 1 200px", maxWidth: "300px" }}
        >
          <option value="">-- Menu chọn lớp --</option>
          {(data.classes || []).map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button 
          style={{ background: selectedClassToDelete ? "#b91c1c" : "#fca5a5", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", fontWeight: "bold", cursor: selectedClassToDelete ? "pointer" : "not-allowed" }}
          disabled={!selectedClassToDelete || busy}
          onClick={() => {
            if (confirm("🚨 CẢNH BÁO: Bạn có chắc chắn muốn xóa TOÀN BỘ kết quả điểm của lớp này? Hành động này không thể hoàn tác!")) {
              act({ action: "deleteAttemptsByClass", classId: selectedClassToDelete });
              setSelectedClassToDelete("");
            }
          }}
        >
          Xóa nguyên lớp
        </button>
      </div>

      <Results rows={data.attempts || []} exams={data.exams || []} classes={data.classes || []} act={act} busy={busy} />
    </Page>
  );
  
  if (active === "Sao lưu") return (
    <Page title="Bảo mật & Sao lưu dữ liệu" sub="Quản lý mật khẩu và tải dữ liệu kết quả về máy tính.">
      <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1", marginBottom: "20px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
        <h3 style={{ marginTop: 0, color: "#1e3a8a", display: "flex", alignItems: "center", gap: "8px" }}>🔑 Cài đặt Mật khẩu Giáo viên</h3>
        <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "20px" }}>Bảo vệ tài khoản Quản trị khỏi sự truy cập trái phép. Mật khẩu được mã hóa an toàn trên máy chủ.</p>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button style={{ background: "#10b981", color: "#fff", border: "none", padding: "12px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", transition: "0.2s" }} disabled={busy} onClick={async () => {
            const newPass = prompt("Nhập mật khẩu MỚI bạn muốn đặt:");
            if (newPass) {
              if (changePasswordAction) {
                await changePasswordAction(newPass);
                alert("✅ Đổi mật khẩu thành công!");
              }
            }
          }}>Đổi mật khẩu mới</button>

          <button style={{ background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1", padding: "12px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", transition: "0.2s" }} disabled={busy} onClick={async () => {
            if (confirm("Bạn có chắc muốn khôi phục mật khẩu về mặc định (123456)?")) {
              if (resetPasswordAction) {
                await resetPasswordAction();
                alert("✅ Đã khôi phục mật khẩu về: 123456");
              }
            }
          }}>Khôi phục về mặc định</button>
        </div>
      </div>

      <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #cbd5e1", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
        <h3 style={{ marginTop: 0, color: "#1e3a8a", display: "flex", alignItems: "center", gap: "8px" }}>💾 Sao lưu kết quả lớp học</h3>
        <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "20px" }}>Tải toàn bộ điểm số, thời gian nộp bài của học sinh về máy tính với định dạng tiêu chuẩn.</p>
        
        <div style={{ display: "flex", gap: "15px", flexWrap: "wrap", marginTop: "10px" }}>
          <button style={{ flex: "1 1 200px", background: "#10b981", color: "#fff", border: "none", padding: "14px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "15px" }} onClick={() => excel(data.attempts || [])}>
            📊 Tải Excel
          </button>
          <button style={{ flex: "1 1 200px", background: "#2563eb", color: "#fff", border: "none", padding: "14px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "15px" }} onClick={() => doc(data.attempts || [])}>
            📝 Tải Word (.doc)
          </button>
          <button style={{ flex: "1 1 200px", background: "#ef4444", color: "#fff", border: "none", padding: "14px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", fontSize: "15px" }} onClick={() => printPdf(data.attempts || [])}>
            🖨️ In / Lưu PDF
          </button>
        </div>
      </div>
    </Page>
  );
  
  if (active === "Quản lý bài phát") return <Page><div className="panel"><h3>Danh sách bài</h3>{(data.exams || []).map((e: any) => (<div className="list-row" key={e.id}><div><b>{e.title}</b><small>Mã bài: {e.code} · {e.durationMinutes} phút</small></div><button style={{ background: "#ef4444", color: "#fff", border: "none", padding: "6px 12px", borderRadius: "6px", cursor: "pointer" }} onClick={() => { if (confirm(`Xóa bài "${e.title}"?`)) act({ action: "deleteExam", examId: e.id }); }}>🗑️ Xóa bài</button></div>))}{!(data.exams || []).length && <Empty text="Chưa có bài kiểm tra nào." />}</div></Page>;

  return (
    <Page title={`Chào ${data.user.name}`} sub="Lớp học đã sẵn sàng và đồng bộ an toàn.">
      <div className="metric-row">
        <Metric l="Lớp" v={(data.classes || []).length} />
        <Metric l="Học sinh" v={(data.classes || []).reduce((s: number, c: any) => s + (c.students || 0), 0)} />
        <Metric l="Bài đã phát" v={(data.exams || []).length} />
        <Metric l="Điểm TB" v={avg.toFixed(1)} />
      </div>
    </Page>
  );
}

function Student({ active, data, busy, act, answers, setAnswers, triggerMath }: any) {
  const [join, setJoin] = useState("");
  const [shuffledExams, setShuffledExams] = useState<Record<string, any[]>>({});
  
  const [examTimers, setExamTimers] = useState<Record<string, number>>({});
  const [warnings, setWarnings] = useState<Record<string, number>>({});
  const [warningModal, setWarningModal] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("v17_student_answers");
      if (saved) setAnswers(JSON.parse(saved));
    } catch (e) {}
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        (data.exams || []).forEach((e: any) => {
          const done = (data.attempts || []).some((a: any) => a.examId === e.id);
          if (!done) {
            setWarnings((prev) => {
              const current = (prev[e.id] || 0) + 1;
              if (current >= 3) {
                act({ action: "submitExam", examId: e.id, answers: answers[e.id] || {}, startedAt: new Date().toISOString() });
                setWarningModal(`Bạn đã rời khỏi màn hình bài thi "${e.title}" quá 3 lần. Hệ thống đã tự động thu bài!`);
              } else {
                setWarningModal(`⚠️ CẢNH BÁO (${current}/3): Bạn vừa rời khỏi màn hình làm bài! Tránh chuyển tab nếu không muốn bị thu bài.`);
              }
              return { ...prev, [e.id]: current };
            });
          }
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [data.exams, data.attempts, answers]);

  const getStudentAssignedExams = () => {
    const exams = data.exams || [];
    const groups: Record<string, any[]> = {};
    
    exams.forEach((e: any) => {
      const baseTitle = e.title.replace(/\s*[-–(]\s*(Đề|Mã|Version|Phần).*$/i, "").trim();
      if (!groups[baseTitle]) groups[baseTitle] = [];
      groups[baseTitle].push(e);
    });

    const studentEmail = data.user.email || "default";
    const assignedExams: any[] = [];

    Object.keys(groups).forEach((baseTitle) => {
      const variants = groups[baseTitle];
      if (variants.length === 1) {
        assignedExams.push(variants[0]);
      } else {
        let hash = 0;
        for (let i = 0; i < studentEmail.length; i++) {
          hash = (hash << 5) - hash + studentEmail.charCodeAt(i);
          hash |= 0;
        }
        const index = Math.abs(hash) % variants.length;
        assignedExams.push(variants[index]);
      }
    });

    return assignedExams;
  };

  const currentExams = getStudentAssignedExams();

  useEffect(() => {
    const newShuffled: Record<string, any[]> = {};
    const newTimers: Record<string, number> = {};
    let changed = false;

    const now = Date.now();
    currentExams.forEach((e: any) => {
      if (!shuffledExams[e.id]) {
        const qs = [...(e.publicQuestions || [])];
        for (let i = qs.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [qs[i], qs[j]] = [qs[j], qs[i]];
        }
        newShuffled[e.id] = qs;
        changed = true;
      }
      if (!examTimers[e.id]) {
        const durationMs = (e.durationMinutes || 45) * 60 * 1000;
        newTimers[e.id] = now + durationMs;
      }
    });

    if (changed) {
      setShuffledExams((prev) => ({ ...prev, ...newShuffled }));
      setExamTimers((prev) => ({ ...prev, ...newTimers }));
    }
    triggerMath();
  }, [currentExams, active]);

  const handleAnswerChange = (examId: string, qId: string, val: string) => {
    setAnswers((prev) => {
      const updated = {
        ...prev,
        [examId]: { ...(prev[examId] || {}), [qId]: val },
      };
      try { localStorage.setItem("v17_student_answers", JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  if (active === "Lớp của em")
    return (
      <Page title="Lớp của em" sub="Nhập mã lớp do giáo viên cung cấp.">
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); act({ action: "joinClass", code: join }); setJoin(""); }}>
          <input value={join} onChange={(e) => setJoin(e.target.value.toUpperCase())} placeholder="MÃ LỚP" />
          <button disabled={busy}>Tham gia</button>
        </form>
        <div className="card-grid">
          {(data.classes || []).map((c: any) => (<article className="class-card" key={c.id}><div className="class-icon">12</div><h3>{c.name}</h3></article>))}
        </div>
      </Page>
    );

  if (active === "Kết quả" || active === "Năng lực")
    return (
      <Page title={active} sub="Kết quả được chấm và lưu từ máy chủ.">
        <div className="metric-row">
          <Metric l="Bài đã nộp" v={(data.attempts || []).length} />
          <Metric l="Điểm cao nhất" v={(data.attempts || []).length ? Math.max(...(data.attempts || []).map((a: any) => (a.score / a.maxScore) * 10)).toFixed(1) : "—"} />
        </div>
      </Page>
    );

  return (
    <Page title={`Chào ${data.user.name}`} sub="Bài tập trực tuyến an toàn (Mỗi học sinh nhận 1 mã đề độc lập).">
      {warningModal && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999 }}>
          <div style={{ background: "#fff", padding: "30px", borderRadius: "12px", maxWidth: "450px", textAlign: "center", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.3)" }}>
            <h2 style={{ color: "#b91c1c", marginBottom: "15px" }}>⚠️ Cảnh báo gian lận</h2>
            <p style={{ fontSize: "16px", color: "#334155", marginBottom: "20px" }}>{warningModal}</p>
            <button className="primary-btn" onClick={() => setWarningModal(null)} style={{ background: "#1e3a8a", padding: "10px 20px" }}>Tôi đã hiểu</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>
        {currentExams.map((e: any) => {
          const attempt = (data.attempts || []).find((a: any) => a.examId === e.id);
          const done = !!attempt;
          const questionsList = shuffledExams[e.id] || e.publicQuestions || [];
          const endTime = examTimers[e.id] || (Date.now() + (e.durationMinutes || 45) * 60 * 1000);

          return (
            <article key={e.id} style={{ background: "#fff", padding: "30px", borderRadius: "16px", border: "1px solid #cbd5e1", width: "100%", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "2px solid #f1f5f9", paddingBottom: "12px" }}>
                <div>
                  <span style={{ fontSize: "14px", fontWeight: "bold", color: "#64748b", textTransform: "uppercase" }}>TOÁN 12 · {e.durationMinutes} phút</span>
                  <h2 style={{ fontSize: "22px", color: "#1e3a8a", marginTop: "4px" }}>{e.title}</h2>
                  <p style={{ fontSize: "13px", color: "#64748b" }}>Mã đề riêng của bạn: <b>{e.code}</b></p>
                </div>
                {!done && (
                  <ExamTimer 
                    endTime={endTime} 
                    onTimeOut={() => {
                      alert("Đã hết thời gian làm bài! Hệ thống sẽ tự động nộp bài của bạn.");
                      act({ action: "submitExam", examId: e.id, answers: answers[e.id] || {}, startedAt: new Date().toISOString() });
                    }} 
                  />
                )}
              </div>

              {done ? (
                <div style={{ padding: "24px", background: "#f0fdf4", borderRadius: "12px", border: "1px solid #bbf7d0", marginTop: "15px", textAlign: "center" }}>
                  <div style={{ fontSize: "18px", fontWeight: "bold", color: "#166534", marginBottom: "8px" }}>✓ Bạn đã nộp bài thành công!</div>
                  <p style={{ fontSize: "16px", color: "#15803d" }}>Điểm số đạt được: <b>{attempt.score} / {attempt.maxScore}</b> ({((attempt.score / attempt.maxScore) * 10).toFixed(1)} điểm)</p>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: "13px", color: "#0ea5e9", marginBottom: "20px", background: "#f0f9ff", padding: "10px 14px", borderRadius: "8px", border: "1px solid #bae6fd" }}>
                    💾 Trạng thái: Hệ thống đang tự động lưu nháp câu trả lời của bạn trên máy.
                  </div>

                  {questionsList.map((q: any, i: number) => (
                    <StudentQuestionItem 
                      key={q.id || i}
                      q={q}
                      i={i}
                      examId={e.id}
                      answerValue={answers[e.id]?.[q.id] || ""}
                      onAnswerChange={handleAnswerChange}
                    />
                  ))}

                  <button 
                    className="primary-btn" 
                    style={{ width: "100%", marginTop: "20px", background: "#1e3a8a", padding: "16px", fontSize: "18px", fontWeight: "bold", borderRadius: "10px", cursor: "pointer", color: "#fff", border: "none" }} 
                    disabled={busy || questionsList.length === 0} 
                    onClick={() => {
                      if (confirm("Bạn có chắc chắn muốn nộp bài thi này không? Sau khi nộp sẽ không thể thay đổi đáp án!")) {
                        act({ action: "submitExam", examId: e.id, answers: answers[e.id] || {}, startedAt: new Date().toISOString() });
                      }
                    }}
                  >
                    Nộp bài an toàn
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {currentExams.length === 0 && <Empty text="Chưa có bài cần làm." />}
      </div>
    </Page>
  );
}

const icon: Record<string, string> = { "Tổng quan": "⌂", "Lớp học": "▦", "Studio đề": "✦", "Quản lý bài phát": "▤", "Nhúng link": "🔗", "Kết quả": "◉", "Sao lưu": "⛨", "Bài cần làm": "✎", "Lớp của em": "▦", "Năng lực": "◇" };

function Page({ title, sub, children }: any) { 
  return (
    <section>
      {(title || sub) && (
        <div className="section-head">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <p>{sub}</p>}
          </div>
        </div>
      )}
      {children}
    </section>
  ); 
}

function Metric({ l, v }: any) { return <article className="metric"><small>{l}</small><strong>{v}</strong><span>Đã đồng bộ</span></article>; }
function Empty({ text }: any) { return <div className="empty">◇<p>{text}</p></div>; }

function Results({ rows, exams, classes, act, busy }: any) { 
  const getClassName = (examId: string) => {
    const exam = (exams || []).find((e: any) => e.id === examId);
    if (!exam) return "Không rõ";
    const cls = (classes || []).find((c: any) => c.id === exam.classId);
    return cls ? cls.name : "Không rõ";
  };

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Học sinh</th>
            <th>Lớp</th>
            <th>Mã Bài</th>
            <th>Điểm</th>
            <th>Nộp lúc</th>
            <th style={{ textAlign: "right" }}>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a: any) => (
            <tr key={a.id}>
              <td><b>{a.studentName}</b><br/><small>{a.studentEmail}</small></td>
              <td><span style={{ background: "#e0f2fe", color: "#0369a1", padding: "4px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "bold" }}>{getClassName(a.examId)}</span></td>
              <td>#{a.examId}</td>
              <td><b>{((a.score / a.maxScore) * 10).toFixed(1)}</b></td>
              <td>{new Date(a.submittedAt).toLocaleString("vi-VN")}</td>
              <td style={{ textAlign: "right" }}>
                <button 
                  style={{ background: "#fee2e2", color: "#b91c1c", border: "none", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "bold" }}
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Bạn có chắc chắn muốn xóa bài nộp của học sinh ${a.studentName} không? Hành động không thể hoàn tác.`)) {
                      act({ action: "deleteAttempt", attemptId: a.id });
                    }
                  }}
                >
                  Xóa
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <Empty rows={rows} text="Chưa có bài nộp." />}
    </div>
  ); 
}

function excel(rows: any[]) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><table border="1"><thead><tr><th>Học sinh</th><th>Email</th><th>Mã bài</th><th>Điểm</th><th>Thời gian nộp</th></tr></thead><tbody>` + rows.map((a) => `<tr><td>${a.studentName}</td><td>${a.studentEmail}</td><td>#${a.examId}</td><td>${((a.score / a.maxScore) * 10).toFixed(1)}</td><td>${new Date(a.submittedAt).toLocaleString("vi-VN")}</td></tr>`).join("") + `</tbody></table></body></html>`;
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "Ket_qua_V17.xls";
  a.click();
}

function doc(rows: any[]) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>Bang Diem</title></head><body><h2 style="text-align:center;">BẢNG ĐIỂM KẾT QUẢ TỔNG HỢP</h2><table border="1" style="border-collapse: collapse; width: 100%; text-align: center;" cellpadding="5"><thead><tr style="background-color: #f1f5f9;"><th>Học sinh</th><th>Email</th><th>Mã bài</th><th>Điểm</th><th>Thời gian nộp</th></tr></thead><tbody>` + rows.map(a => `<tr><td>${a.studentName}</td><td>${a.studentEmail}</td><td>#${a.examId}</td><td><b>${((a.score/a.maxScore)*10).toFixed(1)}</b></td><td>${new Date(a.submittedAt).toLocaleString("vi-VN")}</td></tr>`).join('') + `</tbody></table></body></html>`;
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Ket_qua_V17.doc'; a.click();
}

function printPdf(rows: any[]) {
  const html = `<html><head><meta charset="utf-8"><title>Bảng Điểm PDF</title><style>body{font-family: Arial, sans-serif; padding: 20px;} table{border-collapse: collapse; width: 100%; margin-top: 20px;} th, td{border: 1px solid #000; padding: 10px; text-align: left;} th{background-color: #f1f5f9;}</style></head><body><h2 style="text-align:center;">BẢNG ĐIỂM KẾT QUẢ TỔNG HỢP</h2><table><thead><tr><th>Học sinh</th><th>Email</th><th>Mã bài</th><th>Điểm (Hệ 10)</th><th>Thời gian nộp</th></tr></thead><tbody>` + rows.map(a => `<tr><td><b>${a.studentName}</b></td><td>${a.studentEmail}</td><td>#${a.examId}</td><td><b>${((a.score/a.maxScore)*10).toFixed(1)}</b></td><td>${new Date(a.submittedAt).toLocaleString("vi-VN")}</td></tr>`).join('') + `</tbody></table><script>window.print();</script></body></html>`;
  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); } 
  else { alert("Trình duyệt đang chặn Pop-up. Vui lòng cho phép Pop-up để tải PDF."); }
}

// BỘ LỌC ĐĂNG NHẬP THÔNG MINH
export function LoginForm({ onLogin, onSendCode, onVerifyReset }: any) {
  const [name, setName] = useState("");
  const [classCode, setClassCode] = useState(""); 
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);

    const finalName = name.trim();
    // KIỂM TRA ĐÚNG CHUẨN MÃ LỚP MỚI CHO QUA
    const rawClass = classCode.trim();
    
    if (finalName.split(/\s+/).length < 2) {
        setError("❌ Họ và Tên phải có từ 2 chữ trở lên (Ví dụ: Hồ Thuyết Dũng).");
        setBusy(false); return;
    }
    if (/\d/.test(finalName)) {
        setError("❌ Họ và Tên không được chứa số!");
        setBusy(false); return;
    }
    const isCapitalized = finalName.split(/\s+/).every(w => w.length > 0 && w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase());
    if (!isCapitalized) {
        setError("❌ Lỗi định dạng: Vui lòng viết HOA chữ cái đầu của mỗi từ trong Tên (Ví dụ: Hồ Thuyết Dũng).");
        setBusy(false); return;
    }

    // CHẶN 12a01 VÀ BẮT BUỘC NHẬP 12A01
    const classRegex = /^[1-9][0-9]?[A-Z][0-9]*$/;
    if (!classRegex.test(rawClass)) {
        setError("❌ Lớp học không hợp lệ! Vui lòng viết HOA tên phân lớp (Ví dụ đúng: 12A01. Lỗi sai: 12a01).");
        setBusy(false); return;
    }

    const cleanName = finalName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '').toLowerCase();
    const finalEmail = `${cleanName}.${rawClass.toLowerCase()}@student.v17`;

    const formData = new FormData();
    formData.append("email", finalEmail);
    formData.append("name", finalName);
    formData.append("roleType", "student");

    const res = await onLogin(formData);
    if (res?.error) setError(res.error);
    setBusy(false);
  };

  const handleTeacherLogin = async () => {
     setBusy(true);
     setError("");
     if (!password) {
         setError("❌ Vui lòng nhập mật khẩu Giáo viên vào ô bên dưới trước khi bấm nút!");
         setBusy(false);
         return;
     }
     const formData = new FormData();
     formData.append("email", "thuyetdung@gmail.com");
     formData.append("name", "Hồ Thuyết Dũng");
     formData.append("roleType", "teacher");
     formData.append("password", password);
     
     const res = await onLogin(formData);
     if (res?.error) setError(res.error);
     setBusy(false);
  };

  const handleForgotPassword = async () => {
     setBusy(true);
     await onSendCode();
     setBusy(false);
     
     alert("Hệ thống đã gửi một mã xác minh gồm 6 số đến email quản trị (Mã hiện đang in trên màn hình đen máy chủ Node/Vercel).");
     
     const code = prompt("Vui lòng nhập mã xác minh 6 chữ số:");
     if (!code) return;

     const newPass = prompt("Xác minh thành công! Vui lòng tạo mật khẩu MỚI của bạn:");
     if (!newPass || newPass.trim() === "") {
        alert("❌ Lỗi: Bạn chưa nhập mật khẩu mới.");
        return;
     }

     setBusy(true);
     const res = await onVerifyReset(code.trim(), newPass.trim());
     setBusy(false);
     
     if (res?.error) {
        alert(res.error);
     } else {
        alert("✅ Đổi mật khẩu thành công! Bạn có thể dùng mật khẩu mới này để đăng nhập Quản Trị ngay bây giờ.");
     }
  };

  return (
    <main className="signin" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '20px' }}>
      <div className="signin-card" style={{ background: '#fff', padding: '50px 40px', borderRadius: '24px', width: '100%', maxWidth: '680px', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
        <div className="brand-mark" style={{ width: '56px', height: '56px', background: '#fbbf24', color: '#1e3a8a', fontSize: '28px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '16px', margin: '0 auto 24px' }}>Đ</div>
        <p className="eyebrow" style={{ fontSize: '13px', fontWeight: 'bold', color: '#64748b', letterSpacing: '1.5px', margin: '0 0 10px', textTransform: "uppercase" }}>ĐỈNH CAO TRÍ TUỆ</p>
        <h1 style={{ fontSize: '32px', color: '#1e3a8a', margin: '0 0 12px' }}>ỨNG DỤNG HỌC VÀ THI ONLINE</h1>
        <p style={{ color: '#64748b', fontSize: '16px', margin: '0 0 32px' }}>Hệ thống đăng nhập tự động co giãn. Mọi phiên bản đều được mã hóa an toàn 100%.</p>

        {error && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "14px", borderRadius: "10px", marginBottom: "20px", fontWeight: "bold", border: "1px solid #fca5a5" }}>{error}</div>}

        <div style={{ display: "flex", gap: "16px", marginTop: "20px", marginBottom: "20px", flexWrap: "wrap" }}>
          
          <div style={{ flex: "1 1 250px", display: "flex", flexDirection: "column", gap: "10px", background: "#f8fafc", padding: "20px", borderRadius: "16px", border: "1px solid #e2e8f0" }}>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Nhập mật khẩu Giáo viên..." style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", fontSize: "15px", textAlign: "center", outline: "none", background: "#fff" }} />
            <button type="button" onClick={handleTeacherLogin} disabled={busy} style={{ width: "100%", padding: "14px", background: "#eff6ff", color: "#1e3a8a", border: "2px solid #1e3a8a", borderRadius: "10px", fontWeight: "bold", fontSize: "16px", cursor: busy ? "not-allowed" : "pointer", transition: "all 0.2s" }}>
              👨‍🏫 Quản Trị
            </button>
          </div>

          <div style={{ flex: "1 1 250px", display: "flex", flexDirection: "column", gap: "10px", background: "#fef2f2", padding: "20px", borderRadius: "16px", border: "1px solid #fca5a5" }}>
            <div style={{ height: "46px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", color: "#b91c1c", fontWeight: "bold" }}>Khôi phục qua Email Quản trị</div>
            <button type="button" onClick={handleForgotPassword} disabled={busy} style={{ width: "100%", padding: "14px", background: "#fff", color: "#b91c1c", border: "2px solid #b91c1c", borderRadius: "10px", fontWeight: "bold", fontSize: "16px", cursor: busy ? "not-allowed" : "pointer", transition: "all 0.2s" }}>
              🔑 Quên mật khẩu
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", margin: "24px 0" }}>
          <hr style={{ flex: 1, border: "none", borderTop: "1px solid #cbd5e1" }} />
          <span style={{ padding: "0 16px", color: "#64748b", fontSize: "15px", fontWeight: "bold", textTransform: "uppercase" }}>ĐĂNG NHẬP DÀNH CHO HỌC SINH</span>
          <hr style={{ flex: 1, border: "none", borderTop: "1px solid #cbd5e1" }} />
        </div>
        
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px", margin: "10px 0 20px" }}>
          <input 
            type="text" 
            value={name} onChange={e=>setName(e.target.value)}
            placeholder="1. Nhập Họ và tên (Bắt buộc viết HOA chữ cái đầu)" 
            required 
            style={{ padding: "16px", borderRadius: "10px", border: "1px solid #cbd5e1", color: "#0f172a", fontSize: "16px", outline: "none", background: "#f8fafc" }}
          />
          <input 
            type="text" 
            value={classCode} onChange={e=>setClassCode(e.target.value)}
            placeholder="2. Nhập Mã Lớp (Ví dụ đúng: 12A01, sai: 12a01)" 
            required 
            style={{ padding: "16px", borderRadius: "10px", border: "1px solid #cbd5e1", color: "#0f172a", fontSize: "16px", outline: "none", background: "#f8fafc" }}
          />
          <button type="submit" disabled={busy} className="primary-btn" style={{ background: "#1e3a8a", color: "#fff", cursor: busy ? "not-allowed" : "pointer", border: "none", width: "100%", fontSize: "18px", padding: "16px", borderRadius: "10px", fontWeight: "bold", marginTop: "8px" }}>
            {busy ? "Đang kiểm tra dữ liệu..." : "Vào lớp học ngay"}
          </button>
        </form>

        <div className="trust-row" style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '30px', fontSize: '14px', color: '#64748b', fontWeight: 'bold' }}>
          <span>🔒 SSL/TLS</span>
          <span>✓ HttpOnly</span>
          <span>✓ Dữ liệu chuẩn hóa</span>
        </div>
      </div>
    </main>
  );
}