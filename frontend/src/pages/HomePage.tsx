import { ActionBar } from "../components/ui/ActionBar";
import { HeroSection } from "../components/ui/HeroSection";
import { PageShell } from "../components/ui/PageShell";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { SectionCard } from "../components/ui/SectionCard";
import { StatusBadge } from "../components/ui/StatusBadge";

export function HomePage() {
  return (
    <PageShell className="home-page" width="wide">
      <HeroSection
        backgroundImage="/hero-bg.png"
        actions={(
          <div className="home-page__hero-actions">
            <ActionBar>
              <PrimaryButton to="/lobby">进入大厅</PrimaryButton>
            </ActionBar>
            <div className="home-page__rule-strip" aria-label="开局规则">
              <span className="home-page__rule-pill">5 人固定局</span>
              <span className="home-page__rule-pill">选国家</span>
              <span className="home-page__rule-pill">全员准备</span>
              <span className="home-page__rule-pill">自动开局</span>
            </div>
          </div>
        )}
        aside={(
          <SectionCard
             description="这里不需要先读很长规则。进入大厅后，系统会把你带进身份确认、房间准备和自动开局这条主线。"
             eyebrow="进入大厅前你只需要知道 4 步"
             title="4 步进入第一局"
             tone="accent"
           >
            <ol className="home-page__step-list home-page__step-list--compact">
              <li>先确认昵称，系统会把它当作你这台设备的身份。</li>
              <li>进入大厅后，创建房间或加入等待中的房间。</li>
              <li>进入房间后选择国家，确认你这一局代表谁。</li>
              <li>全员点下准备后，系统会自动进入第 1 回合。</li>
            </ol>
          </SectionCard>
        )}
        badges={(
          <>
            <StatusBadge>多人策略对局</StatusBadge>
            <StatusBadge tone="muted">15 回合推进</StatusBadge>
            <StatusBadge tone="success">四阶段议程</StatusBadge>
          </>
        )}
        description="这是一局 5 人参与的回合制列强经营对局。你会在生产、市场、军事和政治四个阶段里做有限决策，拿结果、滚动下一轮，并最终按累计总收入排名。"
        eyebrow="5 人回合制列强经营对局"
        title="第一次进入也能顺着玩完一局"
      />

      <section className="home-page__grid">
        <SectionCard
          description="整局不会要求你背规则墙。你只需要知道每回合固定按这条循环推进，上一阶段的结果会回流到下一轮经营。"
          eyebrow="这局怎么玩"
          title="四阶段经营循环"
        >
          <div className="home-page__feature-list">
            <article className="home-page__feature-item">
               <h4>生产</h4>
               <p>决定怎么花投资预算、怎么处理库存和产线，为后面的市场与成长做准备。</p>
            </article>
            <article className="home-page__feature-item">
               <h4>市场</h4>
               <p>把货卖到国内和区域市场，直接把经营决策变成收入，并影响你在排行榜上的位置。</p>
            </article>
            <article className="home-page__feature-item">
               <h4>军事与政治</h4>
               <p>它们不会总是立刻赚钱，但会改变航路、准入、财政和科技空间，反过来影响下一轮经营。</p>
            </article>
          </div>
        </SectionCard>

        <SectionCard
          description="首页只负责告诉你这局是什么；真正的创建、选房和继续上次进度都放在大厅里，避免第一次进入就被表单和状态打断。"
          eyebrow="进入大厅后会发生什么"
          title="从这里进入房间主线"
        >
          <ol className="home-page__step-list">
             <li>先确认昵称，再进入大厅的下一步引导。</li>
             <li>大厅会告诉你哪些房间正在等人，也会提示如何回到上次进度。</li>
             <li>进入房间后选择国家、点击准备，等全员满足条件后系统自动开局。</li>
          </ol>
        </SectionCard>
      </section>
    </PageShell>
  );
}
