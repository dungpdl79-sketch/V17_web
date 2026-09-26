"use client";

import { useMemo, useState } from "react";
import styles from "./games.module.css";

type GameId = "quiz" | "match" | "order" | "detective" | "vector";
type Feedback = { ok: boolean; text: string } | null;

const games: Array<{ id: GameId; icon: string; title: string; description: string; color: string }> = [
  { id: "quiz", icon: "⚡", title: "Chinh phục tốc độ", description: "Trả lời nhanh câu hỏi trắc nghiệm", color: "#ff8a34" },
  { id: "match", icon: "🧩", title: "Ghép cặp kiến thức", description: "Nối khái niệm với biểu thức đúng", color: "#7357df" },
  { id: "order", icon: "🪜", title: "Xếp bước giải", description: "Đưa quy trình giải về đúng thứ tự", color: "#198f75" },
  { id: "detective", icon: "🔎", title: "Thám tử Toán học", description: "Phát hiện lỗi sai trong lời giải", color: "#d84f65" },
  { id: "vector", icon: "🧭", title: "Phòng thí nghiệm vectơ", description: "Khám phá phép cộng vectơ trực quan", color: "#2578c8" },
];

const quizQuestions = [
  { q: "Cho f'(x) > 0 trên khoảng (a; b). Kết luận nào đúng?", options: ["f nghịch biến", "f đồng biến", "f không đổi", "Không thể kết luận"], answer: 1, why: "Đạo hàm dương trên một khoảng thì hàm số đồng biến trên khoảng đó." },
  { q: "Vectơ u = (2; −1), v = (3; 4). Tọa độ u + v là:", options: ["(5; 3)", "(1; 5)", "(6; −4)", "(−1; −5)"], answer: 0, why: "Cộng từng tọa độ: (2 + 3; −1 + 4) = (5; 3)." },
  { q: "Giá trị nhỏ nhất của x² + 1 trên ℝ là:", options: ["−1", "0", "1", "2"], answer: 2, why: "Vì x² ≥ 0 nên x² + 1 ≥ 1; dấu bằng khi x = 0." },
];

const matching = [
  { left: "f'(x) > 0", right: "Hàm số đồng biến" },
  { left: "f'(x) < 0", right: "Hàm số nghịch biến" },
  { left: "f'(x) = 0", right: "Điểm tới hạn có thể có" },
];

const initialSteps = [
  "Lập bảng biến thiên",
  "Tính đạo hàm f'(x)",
  "Kết luận khoảng đồng biến, nghịch biến",
  "Tìm nghiệm của f'(x) = 0",
];

export default function GameHub() {
  const [active, setActive] = useState<GameId | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [played, setPlayed] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [quizIndex, setQuizIndex] = useState(0);
  const [matchLeft, setMatchLeft] = useState<number | null>(null);
  const [matched, setMatched] = useState<number[]>([]);
  const [steps, setSteps] = useState(initialSteps);
  const [vectorA, setVectorA] = useState(2);
  const [vectorB, setVectorB] = useState(3);

  const progress = useMemo(() => Math.min(100, Math.round((played / 5) * 100)), [played]);

  function reward(ok: boolean, text: string) {
    setFeedback({ ok, text });
    setPlayed((n) => n + 1);
    if (ok) {
      setScore((n) => n + 100 + streak * 20);
      setStreak((n) => n + 1);
    } else {
      setStreak(0);
    }
  }

  function openGame(id: GameId) {
    setActive(id);
    setFeedback(null);
  }

  function resetSession() {
    setScore(0); setStreak(0); setPlayed(0); setFeedback(null);
    setQuizIndex(0); setMatched([]); setMatchLeft(null); setSteps(initialSteps);
  }

  function moveStep(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    setSteps(next);
  }

  function renderGame() {
    if (!active) return null;
    const game = games.find((item) => item.id === active)!;

    return (
      <section className={styles.stage} aria-live="polite">
        <div className={styles.stageHead}>
          <div>
            <button className={styles.back} onClick={() => setActive(null)}>← Kho trò chơi</button>
            <h2>{game.icon} {game.title}</h2>
          </div>
          <div className={styles.scorePill}>⭐ {score} điểm</div>
        </div>

        {active === "quiz" && (() => {
          const item = quizQuestions[quizIndex];
          return <div className={styles.challenge}>
            <span className={styles.level}>Câu {quizIndex + 1}/{quizQuestions.length}</span>
            <h3>{item.q}</h3>
            <div className={styles.options}>
              {item.options.map((option, index) => (
                <button key={option} onClick={() => {
                  reward(index === item.answer, index === item.answer ? "Chính xác! " + item.why : "Chưa đúng. " + item.why);
                }}>{String.fromCharCode(65 + index)}. {option}</button>
              ))}
            </div>
            <button className={styles.next} onClick={() => { setFeedback(null); setQuizIndex((quizIndex + 1) % quizQuestions.length); }}>Câu tiếp theo →</button>
          </div>;
        })()}

        {active === "match" && <div className={styles.challenge}>
          <span className={styles.level}>Chọn một thẻ bên trái, rồi chọn ý nghĩa tương ứng</span>
          <div className={styles.matchGrid}>
            <div>{matching.map((item, index) => <button key={item.left} className={matchLeft === index ? styles.selected : ""} disabled={matched.includes(index)} onClick={() => setMatchLeft(index)}>{item.left}</button>)}</div>
            <div>{[matching[1], matching[2], matching[0]].map((item) => <button key={item.right} disabled={matched.includes(matching.indexOf(item))} onClick={() => {
              const rightIndex = matching.indexOf(item);
              if (matchLeft === null) return setFeedback({ ok: false, text: "Hãy chọn một thẻ biểu thức trước." });
              if (matchLeft === rightIndex) { setMatched((m) => [...m, rightIndex]); reward(true, "Ghép đúng! Hai thẻ có quan hệ chính xác."); }
              else reward(false, "Hai thẻ chưa phù hợp. Hãy đọc lại dấu của đạo hàm.");
              setMatchLeft(null);
            }}>{item.right}</button>)}</div>
          </div>
          <p className={styles.counter}>Đã ghép: {matched.length}/{matching.length}</p>
        </div>}

        {active === "order" && <div className={styles.challenge}>
          <span className={styles.level}>Quy trình xét tính đơn điệu của hàm số</span>
          <div className={styles.stepList}>{steps.map((step, index) => <div key={step}><b>{index + 1}</b><span>{step}</span><button onClick={() => moveStep(index, -1)} aria-label="Đưa lên">↑</button><button onClick={() => moveStep(index, 1)} aria-label="Đưa xuống">↓</button></div>)}</div>
          <button className={styles.primary} onClick={() => {
            const correct = ["Tính đạo hàm f'(x)", "Tìm nghiệm của f'(x) = 0", "Lập bảng biến thiên", "Kết luận khoảng đồng biến, nghịch biến"];
            reward(steps.every((s, i) => s === correct[i]), steps.every((s, i) => s === correct[i]) ? "Hoàn hảo! Quy trình đã đúng." : "Thứ tự chưa đúng. Gợi ý: luôn tính đạo hàm trước.");
          }}>Kiểm tra thứ tự</button>
        </div>}

        {active === "detective" && <div className={styles.challenge}>
          <span className={styles.level}>Hồ sơ số 01</span>
          <h3>Một bạn giải: “Vì f'(x) = 2x và f'(x) = 0 khi x = 0 nên x = 0 chắc chắn là điểm cực đại.”</h3>
          <p>Em hãy tìm nhận định đúng:</p>
          <div className={styles.options}>
            <button onClick={() => reward(false, "Chưa đúng: nghiệm của f'(x)=0 chưa đủ để kết luận cực trị.")}>Lời giải hoàn toàn đúng</button>
            <button onClick={() => reward(true, "Chính xác! Phải xét sự đổi dấu của f'(x); ở đây f' đổi từ âm sang dương nên x=0 là điểm cực tiểu.")}>Bạn chưa xét sự đổi dấu của f'(x)</button>
            <button onClick={() => reward(false, "Đạo hàm f'(x)=2x là đúng; lỗi nằm ở bước kết luận cực trị.")}>Sai vì đạo hàm phải bằng x</button>
          </div>
        </div>}

        {active === "vector" && <div className={styles.challenge}>
          <span className={styles.level}>Thay đổi tọa độ để quan sát quy luật</span>
          <div className={styles.vectorLab}>
            <label>Hoành độ vectơ u: <strong>{vectorA}</strong><input type="range" min="-5" max="5" value={vectorA} onChange={(e) => setVectorA(Number(e.target.value))}/></label>
            <label>Hoành độ vectơ v: <strong>{vectorB}</strong><input type="range" min="-5" max="5" value={vectorB} onChange={(e) => setVectorB(Number(e.target.value))}/></label>
            <div className={styles.numberLine}>
              <span>0</span>
              <div style={{ width: `${Math.abs(vectorA) * 24 + 12}px` }} className={styles.arrowA}>u = {vectorA}</div>
              <div style={{ width: `${Math.abs(vectorB) * 24 + 12}px` }} className={styles.arrowB}>v = {vectorB}</div>
            </div>
            <div className={styles.vectorResult}>u + v = <strong>{vectorA + vectorB}</strong></div>
          </div>
          <button className={styles.primary} onClick={() => reward(true, "Em vừa kiểm chứng: tọa độ của tổng bằng tổng các tọa độ tương ứng.")}>Tôi đã khám phá quy luật</button>
        </div>}

        {feedback && <div className={feedback.ok ? styles.success : styles.error}><b>{feedback.ok ? "✓ Tốt lắm!" : "↻ Thử lại nhé!"}</b><span>{feedback.text}</span></div>}
      </section>
    );
  }

  if (active) return <main className={styles.page}>{renderGame()}</main>;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <nav><a href="/">◆ ĐỈNH CAO TRÍ TUỆ</a><span>Kho trò chơi Toán học</span></nav>
        <div className={styles.heroBody}>
          <div>
            <span className={styles.badge}>HỌC QUA KHÁM PHÁ</span>
            <h1>Mỗi thử thách,<br/><em>một ý tưởng Toán học</em></h1>
            <p>Chọn trò chơi, thử nghiệm và nhận phản hồi ngay. Sai không bị trừ điểm — mỗi lần thử là một bước tiến.</p>
          </div>
          <div className={styles.session}>
            <div><span>Điểm</span><strong>{score}</strong></div>
            <div><span>Chuỗi đúng</span><strong>{streak} 🔥</strong></div>
            <div><span>Tiến độ</span><strong>{progress}%</strong></div>
            <div className={styles.progress}><i style={{ width: `${progress}%` }}/></div>
            <button onClick={resetSession}>Làm mới lượt chơi</button>
          </div>
        </div>
      </header>

      <section className={styles.catalog}>
        <div className={styles.sectionTitle}><div><span>5 CÁCH HỌC KHÁC NHAU</span><h2>Chọn thử thách của em</h2></div><p>Phù hợp học cá nhân, hoạt động nhóm và khởi động tiết học.</p></div>
        <div className={styles.cards}>
          {games.map((game, index) => <button key={game.id} className={styles.card} onClick={() => openGame(game.id)} style={{ "--game-color": game.color } as React.CSSProperties}>
            <span className={styles.cardNumber}>0{index + 1}</span><span className={styles.icon}>{game.icon}</span><h3>{game.title}</h3><p>{game.description}</p><b>Chơi ngay →</b>
          </button>)}
        </div>
      </section>

      <footer className={styles.footer}><span>Đỉnh Cao Trí Tuệ V17.1</span><a href="/">Quay về hệ thống quản lý</a></footer>
    </main>
  );
}
