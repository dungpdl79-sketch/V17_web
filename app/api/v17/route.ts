/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { attempts, classes, exams, memberships, users } from "../../../db/schema";

const now = () => new Date().toISOString();
const makeCode = () =>
  Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
const clean = (v: unknown, n = 120) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, n);

// =====================================================================
// BẢO MẬT — DANH SÁCH EMAIL ĐƯỢC PHÉP LÀM GIÁO VIÊN
// LỖI CŨ CỰC NGHIÊM TRỌNG: action "setRole" nhận role thẳng từ body của trình duyệt
// và ghi đè vào bảng users. Bất kỳ học sinh nào cũng chỉ cần mở Console gõ:
//     fetch('/api/v17',{method:'POST',headers:{'content-type':'application/json'},
//                       body:'{"action":"setRole","role":"teacher"}'})
// là lập tức thành giáo viên, xem được đáp án, xóa lớp, xóa điểm cả trường.
// Từ nay quyền teacher chỉ cấp cho email nằm trong danh sách này.
// =====================================================================
const TEACHER_EMAILS = (() => {
  let fromEnv = "";
  try { fromEnv = (globalThis as any)?.process?.env?.TEACHER_EMAILS || ""; } catch { fromEnv = ""; }
  const list = fromEnv.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.length ? list : ["thuyetdung@gmail.com"];
})();
const isTeacherEmail = (email: string) => TEACHER_EMAILS.includes(String(email || "").toLowerCase());

async function getAuthFromRequest(req?: Request) {
  try {
    if (req) {
      const cookieHeader = req.headers.get("cookie") || "";
      const match = cookieHeader.match(/user_session=([^;]+)/);
      if (match) {
        const session = JSON.parse(decodeURIComponent(match[1]));
        if (session.email && session.name) return { email: String(session.email), displayName: String(session.name) };
      }
    }
  } catch { /* cookie hỏng thì coi như chưa đăng nhập */ }
  return null;
}

// =====================================================================
// CHẤM ĐIỂM
// =====================================================================
const SCORING_MAC_DINH = { mcq: 0.25, sa: 0.5, tf: [0, 0.1, 0.25, 0.5, 1.0], scale10: true };

function chuanHoaScoring(raw: any) {
  const s = raw && typeof raw === "object" ? raw : {};
  const tf = Array.isArray(s.tf) && s.tf.length >= 5 ? s.tf.map((x: any) => Number(x) || 0) : SCORING_MAC_DINH.tf;
  return {
    mcq: Number(s.mcq) > 0 ? Number(s.mcq) : SCORING_MAC_DINH.mcq,
    sa: Number(s.sa) > 0 ? Number(s.sa) : SCORING_MAC_DINH.sa,
    tf,
  };
}

// Đáp án trả lời ngắn: "0,5|1/2|0.5" nghĩa là chấp nhận cả ba cách viết.
// LỖI CŨ: so sánh chuỗi y hệt nhau nên em viết "0,5" trong khi đáp án là "0.5" là bị tính sai.
function chuanHoaSa(v: unknown) {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, "").replace(/,/g, ".");
}
function saDung(traLoi: unknown, dapAn: unknown) {
  const hs = chuanHoaSa(traLoi);
  if (!hs) return false;
  return String(dapAn ?? "")
    .split("|")
    .map(chuanHoaSa)
    .filter(Boolean)
    .some((d) => d === hs);
}

// Học sinh gửi đáp án Đúng/Sai dưới dạng chuỗi 4 ký tự: 'T' = đúng, 'F' = sai, '-' = bỏ trống.
function demYDung(traLoi: unknown, dapAn: any[]) {
  const chuoi = String(traLoi ?? "").padEnd(4, "-");
  let dung = 0;
  for (let i = 0; i < Math.min(4, dapAn.length); i++) {
    const ch = chuoi[i];
    if (ch !== "T" && ch !== "F") continue;
    if ((ch === "T") === !!dapAn[i]) dung++;
  }
  return dung;
}

// Đọc được cả answerKey kiểu mới {type, ans} lẫn kiểu cũ (giá trị trần) của các đề đã phát trước đây.
function docDapAn(entry: any) {
  if (entry && typeof entry === "object" && !Array.isArray(entry) && "ans" in entry) {
    return { type: String(entry.type || "mcq"), ans: entry.ans };
  }
  if (Array.isArray(entry)) return { type: "tf", ans: entry };
  if (typeof entry === "number") return { type: "mcq", ans: entry };
  return { type: "sa", ans: entry };
}

function chamBai(key: Record<string, any>, ans: Record<string, unknown>) {
  const meta = key.__meta;
  const coTrongSo = !!meta; // đề cũ không có __meta thì giữ nguyên cách chấm 1 điểm/câu như trước
  const sc = chuanHoaScoring(meta?.scoring);

  let score = 0;
  let maxScore = 0;

  Object.keys(key).forEach((k) => {
    if (k === "__meta") return;
    const { type, ans: dapAn } = docDapAn(key[k]);
    const traLoi = ans[k];

    if (type === "tf") {
      const mang = Array.isArray(dapAn) ? dapAn : [];
      const soY = demYDung(traLoi, mang);
      if (coTrongSo) {
        score += sc.tf[Math.min(soY, 4)] || 0;
        maxScore += sc.tf[4] || 0;
      } else {
        if (soY === 4) score += 1;
        maxScore += 1;
      }
      return;
    }

    if (type === "sa") {
      const dung = saDung(traLoi, dapAn);
      if (coTrongSo) {
        if (dung) score += sc.sa;
        maxScore += sc.sa;
      } else {
        if (dung) score += 1;
        maxScore += 1;
      }
      return;
    }

    const dung = String(traLoi ?? "").trim() !== "" && String(traLoi).trim() === String(dapAn).trim();
    if (coTrongSo) {
      if (dung) score += sc.mcq;
      maxScore += sc.mcq;
    } else {
      if (dung) score += 1;
      maxScore += 1;
    }
  });

  return { score: Math.round(score * 100) / 100, maxScore: Math.round(maxScore * 100) / 100 };
}

// =====================================================================
// ĐỌC FILE JSON TỪ XƯỞNG V15
// =====================================================================
// LỖI CŨ CỰC NGHIÊM TRỌNG: hàm import chỉ tìm jsonData.mcq / .tf / .sa,
// trong khi Xưởng V15 xuất đề ra dạng { title, code, durationMinutes, scoring, questions:[...] }.
// Kết quả: mọi file đề xuất từ Studio Thiết Kế đều bị từ chối với thông báo
// "File JSON không chứa câu hỏi nào" — tính năng phát đề coi như không dùng được.
function layDanhSachCauHoi(jsonData: any): any[] {
  if (Array.isArray(jsonData)) return jsonData;
  if (Array.isArray(jsonData?.questions)) return jsonData.questions;
  if (Array.isArray(jsonData?.data)) return jsonData.data;
  const mcq = Array.isArray(jsonData?.mcq) ? jsonData.mcq : [];
  const tf = Array.isArray(jsonData?.tf) ? jsonData.tf : [];
  const sa = Array.isArray(jsonData?.sa) ? jsonData.sa : [];
  if (mcq.length || tf.length || sa.length) return [...mcq, ...tf, ...sa];
  for (const k of Object.keys(jsonData || {})) if (Array.isArray(jsonData[k])) return jsonData[k];
  return [];
}

// LỖI CŨ: bỏ qua q.type mà tự đoán lại, đoán sai với câu trả lời ngắn có đáp án là số.
function nhanDangLoai(q: any): "mcq" | "tf" | "sa" {
  const t = q?.type;
  if (t === 1 || t === "1" || t === "mcq") return "mcq";
  if (t === 2 || t === "2" || t === "tf") return "tf";
  if (t === 3 || t === "3" || t === "sa") return "sa";
  if (Array.isArray(q?.stmts) && q.stmts.length) return "tf";
  if (Array.isArray(q?.opts) && q.opts.length) return "mcq";
  return "sa";
}

const troni = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Sinh một mã đề: đảo thứ tự câu, đảo phương án A/B/C/D và đảo thứ tự 4 ý Đúng/Sai.
function taoMotMaDe(cauHoiGoc: any[]) {
  const publicQuestions: any[] = [];
  const answerKey: Record<string, any> = {};

  troni(cauHoiGoc).forEach((q: any) => {
    const loai = nhanDangLoai(q);
    const qId = q.__id;

    if (loai === "mcq") {
      const opts: string[] = Array.isArray(q.opts) ? q.opts : [];
      const chiSoDung = Number(q.ans);
      const kem = opts.map((noiDung, i) => ({ noiDung, dung: i === chiSoDung }));
      const daTron = troni(kem);
      publicQuestions.push({ id: qId, type: "mcq", q: q.q || "", opts: daTron.map((x) => x.noiDung) });
      answerKey[qId] = { type: "mcq", ans: String(daTron.findIndex((x) => x.dung)) };
      return;
    }

    if (loai === "tf") {
      const stmts: any[] = Array.isArray(q.stmts) ? q.stmts.slice(0, 4) : [];
      const daTron = troni(stmts);
      // LỖI CŨ RÒ ĐÁP ÁN: publicQuestions gửi nguyên stmts kèm trường ans:true/false
      // sang trình duyệt học sinh. Mở F12 tab Network là thấy toàn bộ đáp án Đúng/Sai.
      // Ở đây chỉ gửi phần nội dung, đáp án giữ lại trong answerKey (đã bị lọc khỏi GET).
      publicQuestions.push({ id: qId, type: "tf", q: q.q || "", stmts: daTron.map((s: any) => ({ t: s?.t ?? "" })) });
      answerKey[qId] = { type: "tf", ans: daTron.map((s: any) => !!s?.ans) };
      return;
    }

    publicQuestions.push({ id: qId, type: "sa", q: q.q || "" });
    answerKey[qId] = { type: "sa", ans: String(q.ans ?? "") };
  });

  return { publicQuestions, answerKey };
}

// =====================================================================
export async function GET(req: Request) {
  try {
    const auth = await getAuthFromRequest(req);
    if (!auth) return Response.json({ error: "Chưa đăng nhập" }, { status: 401 });

    const db = getDb();
    const [profile] = await db.select().from(users).where(eq(users.email, auth.email)).limit(1);

    if (!profile)
      return Response.json({ user: { email: auth.email, name: auth.displayName, role: null }, classes: [], exams: [], attempts: [] });

    if (profile.role === "teacher") {
      const cs = await db.select().from(classes).where(eq(classes.teacherEmail, auth.email)).orderBy(desc(classes.id));
      const ids = cs.map((x) => x.id);
      const es = ids.length ? await db.select().from(exams).where(inArray(exams.classId, ids)).orderBy(desc(exams.id)) : [];
      const ei = es.map((x) => x.id);
      const at = ei.length ? await db.select().from(attempts).where(inArray(attempts.examId, ei)).orderBy(desc(attempts.id)) : [];
      const ms = ids.length ? await db.select().from(memberships).where(inArray(memberships.classId, ids)) : [];
      return Response.json({
        user: profile,
        classes: cs.map((c) => ({ ...c, students: ms.filter((m) => m.classId === c.id).length })),
        exams: es.map(({ answerKey: _k, ...e }) => ({ ...e, publicQuestions: JSON.parse(e.publicQuestions) })),
        attempts: at,
      });
    }

    const ms = await db.select().from(memberships).where(eq(memberships.studentEmail, auth.email));
    const ids = ms.map((x) => x.classId);
    const cs = ids.length ? await db.select().from(classes).where(inArray(classes.id, ids)) : [];
    const es = ids.length
      ? await db.select().from(exams).where(and(inArray(exams.classId, ids), eq(exams.status, "open")))
      : [];
    const ei = es.map((x) => x.id);

    const at = ei.length
      ? await db.select().from(attempts).where(and(inArray(attempts.examId, ei), eq(attempts.studentEmail, auth.email))).orderBy(desc(attempts.id))
      : [];

    return Response.json({
      user: profile,
      classes: cs,
      exams: es.map(({ answerKey: _k, ...e }) => ({ ...e, publicQuestions: JSON.parse(e.publicQuestions) })),
      attempts: at,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Lỗi máy chủ" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as Record<string, unknown>;
    const auth = await getAuthFromRequest(req);
    if (!auth) return Response.json({ error: "Chưa đăng nhập" }, { status: 401 });

    const db = getDb();
    const [profile] = await db.select().from(users).where(eq(users.email, auth.email)).limit(1);
    const action = clean(b.action, 30);

    if (action === "setRole") {
      const name = clean(b.name || auth.displayName, 100);
      const muonLamGV = b.role !== "student";
      // Quyền teacher chỉ cấp cho email trong danh sách, không cấp theo yêu cầu của trình duyệt.
      const role = muonLamGV && isTeacherEmail(auth.email) ? "teacher" : "student";

      if (profile) {
        // Đã có hồ sơ thì chỉ cho đổi tên hiển thị, KHÔNG cho tự nâng quyền.
        if (profile.role === "student" && role === "teacher") {
          await db.update(users).set({ name }).where(eq(users.email, auth.email));
          return Response.json({ ok: true, role: profile.role });
        }
        await db.update(users).set({ role: profile.role || role, name }).where(eq(users.email, auth.email));
        return Response.json({ ok: true, role: profile.role || role });
      }
      await db.insert(users).values({ email: auth.email, name, role, createdAt: now() });
      return Response.json({ ok: true, role });
    }

    if (!profile) return Response.json({ error: "Hãy chọn vai trò" }, { status: 403 });

    if (action === "createClass" && profile.role === "teacher") {
      const name = clean(b.name, 80);
      if (!name) return Response.json({ error: "Thiếu tên lớp" }, { status: 400 });
      const code = makeCode();
      await db.insert(classes).values({ teacherEmail: auth.email, name, code, schoolYear: "2026–2027", createdAt: now() });
      return Response.json({ ok: true, code });
    }

    if (action === "joinClass" && profile.role === "student") {
      const code = clean(b.code, 8).toUpperCase();
      const [c] = await db.select().from(classes).where(eq(classes.code, code)).limit(1);
      if (!c) return Response.json({ error: "Mã lớp không tồn tại" }, { status: 404 });
      await db.insert(memberships).values({ classId: c.id, studentEmail: auth.email, joinedAt: now() }).onConflictDoNothing();
      return Response.json({ ok: true });
    }

    if (action === "deleteExam" && profile.role === "teacher") {
      const examId = Number(b.examId);
      const [ex] = await db.select().from(exams).where(and(eq(exams.id, examId), eq(exams.teacherEmail, auth.email))).limit(1);
      if (!ex) return Response.json({ error: "Không tìm thấy bài kiểm tra hoặc không có quyền" }, { status: 403 });

      await db.delete(attempts).where(eq(attempts.examId, examId));
      await db.delete(exams).where(eq(exams.id, examId));
      return Response.json({ ok: true });
    }

    if (action === "deleteClass" && profile.role === "teacher") {
      const classId = Number(b.classId);
      const [c] = await db.select().from(classes).where(and(eq(classes.id, classId), eq(classes.teacherEmail, auth.email))).limit(1);
      if (!c) return Response.json({ error: "Không có quyền thao tác với lớp này" }, { status: 403 });

      const classExams = await db.select({ id: exams.id }).from(exams).where(eq(exams.classId, classId));
      const examIds = classExams.map((ex) => ex.id);
      if (examIds.length > 0) await db.delete(attempts).where(inArray(attempts.examId, examIds));

      await db.delete(exams).where(eq(exams.classId, classId));
      await db.delete(memberships).where(eq(memberships.classId, classId));
      await db.delete(classes).where(eq(classes.id, classId));

      return Response.json({ ok: true, message: "Đã xóa lớp thành công" });
    }

    if (action === "deleteAttemptsByClass" && profile.role === "teacher") {
      const classId = Number(b.classId);
      const [c] = await db.select().from(classes).where(and(eq(classes.id, classId), eq(classes.teacherEmail, auth.email))).limit(1);
      if (!c) return Response.json({ error: "Không có quyền thao tác với lớp này" }, { status: 403 });

      const classExams = await db.select({ id: exams.id }).from(exams).where(eq(exams.classId, classId));
      const examIds = classExams.map((ex) => ex.id);
      if (examIds.length > 0) await db.delete(attempts).where(inArray(attempts.examId, examIds));

      return Response.json({ ok: true, message: "Đã xóa điểm toàn bộ lớp thành công" });
    }

    if (action === "deleteAttempt" && profile.role === "teacher") {
      const attemptId = Number(b.attemptId);
      const [att] = await db.select().from(attempts).where(eq(attempts.id, attemptId)).limit(1);
      if (!att) return Response.json({ error: "Không tìm thấy bài nộp" }, { status: 404 });

      const [ex] = await db.select().from(exams).where(and(eq(exams.id, att.examId), eq(exams.teacherEmail, auth.email))).limit(1);
      if (!ex) return Response.json({ error: "Không có quyền xóa bài nộp này" }, { status: 403 });

      await db.delete(attempts).where(eq(attempts.id, attemptId));
      return Response.json({ ok: true, message: "Đã xóa kết quả học sinh thành công" });
    }

    if (action === "importJsonExam" && profile.role === "teacher") {
      const classId = Number(b.classId);
      const [c] = await db.select().from(classes).where(and(eq(classes.id, classId), eq(classes.teacherEmail, auth.email))).limit(1);
      if (!c) return Response.json({ error: "Không có quyền với lớp" }, { status: 403 });

      const jsonData = b.jsonData as any;
      if (!jsonData) return Response.json({ error: "Thiếu dữ liệu JSON" }, { status: 400 });

      const allQ = layDanhSachCauHoi(jsonData);
      if (!allQ.length) return Response.json({ error: "File JSON không chứa câu hỏi nào" }, { status: 400 });

      // Gán id cố định theo thứ tự gốc để mọi mã đề dùng chung một bộ id.
      const cauHoiGoc = allQ.map((q: any, idx: number) => ({ ...q, __id: `q${idx + 1}` }));

      const scoring = chuanHoaScoring(jsonData?.scoring);
      const title = clean(b.title || jsonData?.title || "Kiểm tra Toán 12 từ V15", 90);
      const duration = Math.max(5, Math.min(180, Number(b.duration) || Number(jsonData?.durationMinutes) || 45));

      // LỖI CŨ: giao diện hứa "tạo 45 mã đề" và gửi numVersions lên,
      // nhưng máy chủ bỏ qua hoàn toàn và chỉ tạo đúng MỘT đề duy nhất cho cả lớp.
      const soMaDe = Math.max(1, Math.min(100, Number(b.numVersions) || 1));
      const showScore = b.showScore !== false;

      const danhSachMa: string[] = [];
      for (let v = 0; v < soMaDe; v++) {
        const { publicQuestions, answerKey } = taoMotMaDe(cauHoiGoc);
        const code = makeCode();
        danhSachMa.push(code);

        // __meta không bao giờ lộ ra ngoài vì GET đã loại bỏ trường answerKey.
        answerKey.__meta = { scoring, showScore, soCau: cauHoiGoc.length };

        await db.insert(exams).values({
          classId,
          teacherEmail: auth.email,
          title: soMaDe > 1 ? `${title} (Mã đề ${String(v + 1).padStart(2, "0")})` : title,
          code,
          durationMinutes: duration,
          publicQuestions: JSON.stringify(publicQuestions),
          answerKey: JSON.stringify(answerKey),
          status: "open",
          createdAt: now(),
        });
      }

      return Response.json({ ok: true, code: danhSachMa[0], versions: soMaDe, count: cauHoiGoc.length });
    }

    if (action === "submitExam" && profile.role === "student") {
      const id = Number(b.examId);
      const [e] = await db.select().from(exams).where(and(eq(exams.id, id), eq(exams.status, "open"))).limit(1);
      if (!e) return Response.json({ error: "Bài không còn mở" }, { status: 404 });

      const [m] = await db
        .select()
        .from(memberships)
        .where(and(eq(memberships.classId, e.classId), eq(memberships.studentEmail, auth.email)))
        .limit(1);
      if (!m) return Response.json({ error: "Em chưa thuộc lớp này" }, { status: 403 });

      // LỖI CŨ: không kiểm tra đã nộp hay chưa, chỉ dựa vào onConflictDoNothing.
      // Em nộp lần hai sẽ nhận về điểm mới trên màn hình trong khi CSDL vẫn giữ điểm cũ.
      const [daNop] = await db
        .select()
        .from(attempts)
        .where(and(eq(attempts.examId, id), eq(attempts.studentEmail, auth.email)))
        .limit(1);
      if (daNop) {
        return Response.json({ ok: true, score: daNop.score, maxScore: daNop.maxScore, daNopTruocDo: true });
      }

      const ans = (b.answers && typeof b.answers === "object" ? b.answers : {}) as Record<string, unknown>;
      const key = JSON.parse(e.answerKey) as Record<string, any>;

      // LỖI CŨ: chỉ so sánh chuỗi và cộng 1 điểm mỗi câu.
      // Câu Đúng/Sai có đáp án là mảng nên String([...]) không bao giờ khớp -> LUÔN 0 ĐIỂM.
      // Thang điểm 0,25 / 0,5 / lũy tiến 4 ý mà thầy cài ở Bước 4 cũng bị bỏ qua sạch.
      const { score, maxScore } = chamBai(key, ans);

      await db
        .insert(attempts)
        .values({
          examId: id,
          studentEmail: auth.email,
          studentName: profile.name,
          answers: JSON.stringify(ans),
          score,
          maxScore,
          startedAt: clean(b.startedAt, 40) || now(),
          submittedAt: now(),
        })
        .onConflictDoNothing();

      return Response.json({ ok: true, score, maxScore });
    }

    return Response.json({ error: "Không đủ quyền hoặc thao tác không hợp lệ" }, { status: 403 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Lỗi máy chủ" }, { status: 500 });
  }
}
