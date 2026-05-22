from __future__ import annotations

from flask import request

STRINGS: dict[str, dict[str, str]] = {
    "en": {
        "session_not_found": "Session not found.",
        "room_not_found": "Room not found.",
        "player_not_in_room": "Player not in this room.",
        "game_already_started": "Game has already started.",
        "invalid_country": "Invalid country selection.",
        "country_taken": "This country is already taken.",
        "not_enough_players": "Not enough players to start.",
        "room_full": "Room is full.",
        "submission_deadline_passed": "Submission deadline has passed.",
        "invalid_phase": "Invalid game phase.",
        "config_load_error": "Failed to load configuration.",
        "config_save_error": "Failed to save configuration.",
        "config_save_success": "Configuration saved successfully.",
        "phase_decision": "National Decision",
        "phase_market": "Market Sales",
        "phase_settlement": "Fiscal Settlement",
        "country_britain": "Britain",
        "country_france": "France",
        "country_prussia": "Prussia",
        "country_austria": "Austria",
        "country_russia": "Russia",
        "country_leading": "Leading Nation",
        "final_rank_winner_reason": "You finished 1st because your cumulative national income reached {income}, the highest in the match.",
        "final_rank_winner_income_lead": "You led 2nd place by {gap} cumulative national income, making the production-to-sales chain the decisive gap.",
        "final_rank_winner_tiebreak": "Even if income is tied, your total production capacity {production}, controlled regions {regions}, and final treasury {budget} still provide tie-break advantages.",
        "final_rank_winner_tied": "You finished 1st with {income} cumulative national income tied with 2nd place, then won on the tie-break comparison.",
        "final_rank_winner_tied_detail": "Tie-break order still favored you: total production capacity {production}, controlled regions {regions}, and final treasury {budget}.",
        "final_rank_loser_reason": "You finished rank {rank}; your cumulative national income {income} trailed the leader by {gap}.",
        "final_rank_loser_tied_reason": "You finished rank {rank}; your cumulative national income {income} tied the leader, but the tie-break comparison placed you lower.",
        "final_rank_loser_leader": "The current leader is {leader}, showing that the main win condition remains cumulative operating income and its tie-break support.",
        "final_rank_loser_previous_gap": "You were {gap} cumulative national income behind the previous rank; to climb one place, first stabilize your income realization chain.",
        "final_rank_loser_previous_tied": "You tied the previous rank on cumulative national income; improving production capacity, controlled regions, or final treasury would move you up in the tie-break.",
        "final_turning_last_phase": "Final settlement stopped at {phase}",
        "final_turning_leader_detail": "{country} secured the top rank with {income} cumulative national income.",
        "final_turning_income_lead_title": "Final income lead locked at {lead}",
        "final_turning_income_lead_detail": "{leader} led {runnerUp} by {lead} cumulative national income, {leaderIncome} to {runnerUpIncome}.",
        "final_turning_tie_title": "Final tie decided by tie-breaks",
        "final_turning_tie_detail": "{leader} and {runnerUp} both finished with {income} cumulative national income; final order was decided by production capacity, controlled regions, and final treasury.",
        "final_turning_log_title": "Round {round}: {title}",
        "final_replay_winner_1": "Next game, keep the treasury return rhythm stable every round and avoid inventory pileups breaking the income curve.",
        "final_replay_winner_2": "When already leading, protecting production capacity, regions, and treasury tie-breaks is steadier than blind risk-taking.",
        "final_replay_loser_1": "Next game, build the stable production-to-sales chain in the early rounds before high-threshold actions crowd out real revenue.",
        "final_replay_loser_2": "Once market revenue falls behind, check whether demand, overseas markets, or administrative support are slowing the operating rhythm.",
        "final_log_system_settlement": "The system completed final settlement for this round.",
        "final_log_income_allocation": "{country} completed Round {round} fiscal allocation.",
        "final_log_settlement_complete": "Final fiscal settlement is complete.",
        "final_log_market_complete": "Market sales phase is complete.",
        "final_log_decision_complete": "National decision phase is complete.",
        "final_log_phase_complete": "{phase} phase is complete.",
        "final_log_title_overseas": "Overseas Situation Changed",
        "final_log_title_naval": "Region Blockade Changed",
        "final_log_title_colony": "Overseas Expansion",
        "final_log_title_market": "Market Realization",
        "final_log_title_policy": "Institutional Choice",
        "final_log_title_default": "Key Record",
    },
    "zh": {
        "session_not_found": "未找到会话。",
        "room_not_found": "未找到房间。",
        "player_not_in_room": "玩家不在该房间中。",
        "game_already_started": "游戏已经开始。",
        "invalid_country": "无效的国家选择。",
        "country_taken": "该国已被选择。",
        "not_enough_players": "玩家数量不足，无法开始。",
        "room_full": "房间已满。",
        "submission_deadline_passed": "提交截止时间已过。",
        "invalid_phase": "无效的游戏阶段。",
        "config_load_error": "加载配置失败。",
        "config_save_error": "保存配置失败。",
        "config_save_success": "配置保存成功。",
        "phase_decision": "国家决策",
        "phase_market": "市场出售",
        "phase_settlement": "财政结算",
        "country_britain": "英国",
        "country_france": "法国",
        "country_prussia": "普鲁士",
        "country_austria": "奥地利",
        "country_russia": "俄罗斯",
        "country_leading": "领先国家",
        "final_rank_winner_reason": "你最终位列第 1 名，核心原因是累计国家收入 {income} 为全场最高。",
        "final_rank_winner_income_lead": "你领先第 2 名 {gap} 点累计国家收入，这意味着产销兑现链是这局最直接的分差来源。",
        "final_rank_winner_tiebreak": "即使回流被追平，你的总产能 {production}、控制区域 {regions}、期末国库 {budget} 也会继续在同分比较里提供优势。",
        "final_rank_winner_tied": "你最终位列第 1 名，累计国家收入 {income} 与第 2 名持平，并通过同分比较锁定榜首。",
        "final_rank_winner_tied_detail": "同分比较仍然偏向你：总产能 {production}、控制区域 {regions}、期末国库 {budget}。",
        "final_rank_loser_reason": "你最终位列第 {rank} 名，核心原因是累计国家收入 {income} 仍落后榜首 {gap} 点。",
        "final_rank_loser_tied_reason": "你最终位列第 {rank} 名，累计国家收入 {income} 与榜首持平，但同分比较让你排在后面。",
        "final_rank_loser_leader": "当前榜首是 {leader}，这说明决定胜负的主分差仍是经营收入总量及其同分支撑。",
        "final_rank_loser_previous_gap": "你距离前一名还差 {gap} 点累计国家收入，想再上一个名次，先补最稳定的收入兑现链。",
        "final_rank_loser_previous_tied": "你与前一名累计国家收入持平；提升总产能、控制区域或期末国库就能在同分比较里上升。",
        "final_turning_last_phase": "最后结算定格在{phase}",
        "final_turning_leader_detail": "{country}以 {income} 累计国家收入锁定榜首。",
        "final_turning_income_lead_title": "终局领先差被锁定在 {lead}",
        "final_turning_income_lead_detail": "{leader} 以 {leaderIncome} 的累计国家收入领先 {runnerUp} 的 {runnerUpIncome}，差距 {lead}。",
        "final_turning_tie_title": "终局同分由同分规则裁定",
        "final_turning_tie_detail": "{leader} 与 {runnerUp} 同为 {income} 累计国家收入；最终排序由总产能、控制区域和期末国库决定。",
        "final_turning_log_title": "第 {round} 回合：{title}",
        "final_replay_winner_1": "下次如果想继续稳住榜首，优先把国库回款节奏保持到每一轮，不要让库存积压打断收入曲线。",
        "final_replay_winner_2": "当你已经领先时，继续守住产能、区域和国库三项同分比较，会比盲目冒险更稳。",
        "final_replay_loser_1": "下次先把前几轮最稳定的产销链做出来，别让高门槛动作挤掉当回合真实回款。",
        "final_replay_loser_2": "一旦市场回款开始落后，优先检查是不是内需、海外市场或行政支撑拖慢了经营节奏。",
        "final_log_system_settlement": "系统已完成本回合终局结算。",
        "final_log_income_allocation": "{country}完成第 {round} 回合财政分配。",
        "final_log_settlement_complete": "终局财政结算已完成。",
        "final_log_market_complete": "市场出售阶段已完成。",
        "final_log_decision_complete": "国家决策阶段已完成。",
        "final_log_phase_complete": "{phase}阶段已完成。",
        "final_log_title_overseas": "海外局势变化",
        "final_log_title_naval": "地区封锁变化",
        "final_log_title_colony": "海外扩张",
        "final_log_title_market": "市场兑现",
        "final_log_title_policy": "制度选择",
        "final_log_title_default": "关键记录",
    },
}


def _normalize_language(language: str) -> str:
    normalized = language.strip().lower()
    if normalized.startswith("zh"):
        return "zh"
    if normalized.startswith("en"):
        return "en"
    return "en"


def t(key: str, **kwargs: object) -> str:
    try:
        header = request.headers.get("Accept-Language", "")
        lang = _normalize_language(header.split(",")[0].split(";")[0]) if header else "en"
    except RuntimeError:
        lang = "en"

    strings = STRINGS.get(lang, STRINGS["en"])
    message = strings.get(key, key)
    if kwargs:
        return message.format(**kwargs)
    return message
