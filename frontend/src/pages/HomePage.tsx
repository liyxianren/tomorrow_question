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
            <StatusBadge tone="success">三阶段议程</StatusBadge>
          </>
        )}
        description="这是一局 5 人参与的回合制列强经营对局。每回合你将在国家决策、市场出售、财政结算三个阶段中做有限选择，拿结果、滚动下一轮，并最终按累计总收入排名。"
        eyebrow="5 人回合制列强经营对局"
        title="第一次进入也能顺着玩完一局"
      />

      <section className="home-page__grid">
        <SectionCard
          description="整局不会要求你背规则墙。你只需要知道每回合固定按这条循环推进，上一阶段的结果会回流到下一轮经营。"
          eyebrow="这局怎么玩"
          title="三阶段经营循环"
        >
          <div className="home-page__feature-list">
            <article className="home-page__feature-item">
               <h4>国家决策</h4>
               <p>在工厂、政府政策、市场预览、军事和研究院中分配预算，为后续阶段排兵布阵。</p>
            </article>
            <article className="home-page__feature-item">
               <h4>市场出售</h4>
               <p>把商品投放到国内和海外市场，供需决定价格，销售直接转化为国家收入。</p>
            </article>
            <article className="home-page__feature-item">
               <h4>财政结算</h4>
               <p>结算阶段汇总收入并按比例回流到民间购买力、工厂和政府财政，滚动进入下一回合。</p>
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
