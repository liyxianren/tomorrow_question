from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from flask import Blueprint, current_app, request

from app.contracts.api import error_response, ok_response
from app.contracts.enums import ErrorCode
from app.contracts.enums import CountryCode
from app.modules.balance_config import use_balance_config_dir
from app.modules.balance_config.loader import _load_balance_config_cached
from app.modules.game_state.factory import create_game, create_initial_snapshot


settings_bp = Blueprint("settings", __name__, url_prefix="/api/v1")


_PRODUCTION_NEW_FACTORY_KEYS = ("handicraft", "mechanized", "steam", "electrified")
_PRODUCTION_UPGRADE_KEYS = ("mechanized", "steam", "electrified")
_COUNTRY_KEYS = ("britain", "france", "prussia", "austria", "russia")
_IDEOLOGY_KEYS = ("liberalism", "egalitarianism", "nationalism")
_JSON_SUFFIX = ".json"

_CONTEXT_LABELS: dict[str, str] = {
    "nationalAbilities": "国家能力",
    "countries": "国家初始状态",
    "budgetPools": "预算池",
    "incomeAllocationRatio": "收入分配比例",
    "productionCapacity": "生产能力",
    "goodsStock": "商品库存",
    "ideologyLevels": "思潮水平",
    "initialDiplomacy": "初始外交影响力",
    "domesticMarketActions": "国内市场行动",
    "factoryActions": "工厂行动",
    "governmentActions": "政府行动",
    "regularPolicies": "常规政策",
    "effects": "效果",
    "conditions": "触发条件",
    "globalEffects": "全局效果",
    "regionGoodsPremiums": "区域商品溢价",
    "militaryActions": "军事行动",
    "diplomacyActions": "外交行动",
    "naturalShiftRules": "思潮自然变化规则",
    "policyTradeOpen": "贸易开放政策",
    "reformAdminSupport": "改革行政支持",
    "reformResearchBonus": "改革研究加成",
    "milestones": "里程碑",
    "levels": "生产等级",
    "outputMultipliers": "产出倍率",
    "expansionCosts": "扩建成本",
    "upgradeCosts": "升级成本",
    "newFactoryCosts": "新建工厂成本",
    "goods": "商品参数",
    "reforms": "改革",
    "regions": "区域",
    "resourceLimit": "资源上限",
    "oceanNodes": "海洋节点",
    "talentTree": "天赋树",
    "branches": "天赋分支",
    "nodes": "天赋节点",
    "permanentEffects": "永久效果",
    "routeUnlocks": "生产路线解锁",
    "chains": "科技链",
    "techs": "科技",
}

_SEGMENT_LABELS: dict[str, str] = {
    "britain": "英国",
    "france": "法国",
    "prussia": "普鲁士",
    "austria": "奥地利",
    "russia": "俄国",
    "europe": "欧洲",
    "americas": "美洲",
    "africa": "非洲",
    "middle_east": "中东",
    "asia_pacific": "亚太",
    "north_atlantic": "北大西洋",
    "mediterranean": "地中海",
    "indian_ocean": "印度洋",
    "pacific": "太平洋",
    "domesticMarket": "国内市场",
    "factory": "工厂",
    "governmentFiscal": "政府财政",
    "consumption": "消费池",
    "fiscal": "财政",
    "idle": "闲置",
    "handicraft": "手工业",
    "mechanized": "机械化",
    "steam": "蒸汽",
    "electrified": "电气化",
    "phase1_goods": "统一商品",
    "grain": "粮食",
    "cotton": "棉花",
    "tea": "茶叶",
    "coal": "煤炭",
    "minerals": "矿产",
    "steel": "钢铁",
    "silk": "丝绸",
    "oil": "石油",
    "rubber": "橡胶",
    "liberalism": "自由主义",
    "egalitarianism": "平等主义",
    "nationalism": "民族主义",
    "industry": "工业分支",
    "domestic": "国内市场分支",
    "government": "政府分支",
    "military": "军事分支",
    "freedom_path": "自由路线",
    "equality_path": "平等路线",
    "national_path": "民族路线",
    "infantry": "步兵",
    "artillery": "炮兵",
    "fleets": "舰队",
    "academy": "学院",
    "civil_service": "文官体系",
    "compulsory_education": "义务教育",
    "industrialization": "工业化主线",
}

_FIELD_LABELS: dict[str, str] = {
    "usesPerGame": "每局可使用次数",
    "budgetPoolCost": "预算池消耗",
    "budgetCost": "预算消耗",
    "adminCost": "行政力消耗",
    "adminCostPerTurn": "行政力消耗",
    "maxPerRound": "每回合上限",
    "totalRounds": "总回合数",
    "phaseDurationSeconds": "阶段持续秒数",
    "baseIncomePerRound": "每回合保底收入",
    "baseOverseasCapacity": "基础海外市场容量",
    "rawMaterialsPerTurn": "每回合原材料增量",
    "armyUnitCost": "陆军单位成本",
    "navyUnitCost": "海军单位成本",
    "oceanControlThreshold": "海域控制阈值",
    "independenceThreshold": "独立度叛乱阈值",
    "administrationCost": "购买行政能力价格",
    "ideologyMin": "思潮最小值",
    "ideologyMax": "思潮最大值",
    "revolutionThreshold": "革命阈值",
    "highThreshold": "高位触发阈值",
    "lowThreshold": "低位触发阈值",
    "highShift": "高位自然变化量",
    "lowShift": "低位自然变化量",
    "threshold": "阈值",
    "weight": "事件权重",
    "value": "数值",
    "quantity": "数量",
    "count": "数量",
    "researchFacilityCost": "研究设施成本",
    "researchFacilityProgressPerTurn": "研究设施每回合进度",
    "breakthroughDieSides": "科技突破骰子面数",
    "techPointCost": "科技点成本",
    "techPoints": "科技点",
    "techPointsDelta": "科技点变化",
    "techPointsPerTurn": "每回合科技点",
    "armyCap": "军事力量上限",
    "armyCapDelta": "军事上限变化",
    "domesticMarketBudgetDelta": "国内市场预算变化",
    "factoryBudgetDelta": "工厂预算变化",
    "governmentFiscalBudgetDelta": "政府财政预算变化",
    "domesticMarketCapacityDelta": "国内市场容量变化",
    "overseasMarketCapacityDelta": "海外市场容量变化",
    "domesticPriceBonusDelta": "国内价格加成变化",
    "overseasPriceBonusDelta": "海外价格加成变化",
    "phase1ProductionRawCapacityDelta": "原材料加工产能变化",
    "phase1ProductionOutputBonusPercent": "统一商品产出加成百分比",
    "productionOutputMultiplier": "生产产出倍率",
    "rawMaterialsDelta": "原材料变化",
    "rawMaterialsPerTurnDelta": "每回合原材料变化",
    "administrationCapacity": "行政能力",
    "factoryUpgradeCostReductionPercent": "工厂升级成本降低百分比",
    "newFactoryCostReductionPercent": "新建工厂成本降低百分比",
    "fiscalRefund": "财政返还",
    "targetIdeologyDelta": "目标思潮变化",
    "resetIdeologiesTo": "思潮重置值",
    "all": "全部条件数量",
    "anyPlayerControlledRegionsAtLeast": "任一玩家控制区域至少",
    "unitBudgetCost": "单位预算成本",
    "unitOutput": "单位产出",
    "domesticReferencePrice": "国内参考价格",
    "overseasBasePrice": "海外基础价格",
    "demandThreshold": "需求阈值",
    "priceFloor": "价格下限",
    "priceCeiling": "价格上限",
    "overseasPriceCeiling": "海外价格上限",
    "priceMultiplier": "价格倍率",
    "minArmy": "最低陆军要求",
    "upgradeCostMultiplier": "升级成本倍率",
}


class _ValidationError(ValueError):
    pass


@settings_bp.get("/settings")
def get_settings():
    config_dir = _config_dir()
    production = _read_json(config_dir / "production.json")
    countries = _read_json(config_dir / "countries.json")
    global_cfg = _read_json(config_dir / "global.json")
    regions = _read_json(config_dir / "regions.json")
    politics = _read_json(config_dir / "politics.json")

    politics_shift_rules = politics.get("naturalShiftRules", {})
    numeric_config = _build_numeric_config_payload(config_dir)
    payload = {
        "production": {
            "newFactoryCosts": {
                key: int(production.get("newFactoryCosts", {}).get(key, 0))
                for key in _PRODUCTION_NEW_FACTORY_KEYS
            },
            "upgradeCosts": {
                key: int(production.get("upgradeCosts", {}).get(key, 0))
                for key in _PRODUCTION_UPGRADE_KEYS
            },
        },
        "countries": {
            country: {
                "initialRawMaterials": int(
                    countries.get("countries", {}).get(country, {}).get("initialRawMaterials", 0)
                ),
                "rawMaterialsPerTurn": int(
                    countries.get("countries", {}).get(country, {}).get("rawMaterialsPerTurn", 0)
                ),
            }
            for country in _COUNTRY_KEYS
        },
        "global": {
            "baseIncomePerRound": int(global_cfg.get("baseIncomePerRound", 0)),
        },
        "regions": {
            str(region["regionId"]): float(region.get("priceMultiplier", 1.0))
            for region in regions.get("regions", [])
            if isinstance(region, dict) and "regionId" in region
        },
        "government": {
            "administrationCost": int(politics.get("administrationCost", 0)),
            "ideologyMin": int(politics.get("ideologyMin", 0)),
            "ideologyMax": int(politics.get("ideologyMax", 10)),
            "naturalShiftRules": {
                ideology: {
                    "highThreshold": int(
                        politics_shift_rules.get(ideology, {}).get("highThreshold", 0)
                    ),
                    "lowThreshold": int(
                        politics_shift_rules.get(ideology, {}).get("lowThreshold", 0)
                    ),
                }
                for ideology in _IDEOLOGY_KEYS
            },
        },
        "numericConfig": numeric_config,
        "decisionSandbox": _build_decision_sandbox_payload(config_dir, numeric_config),
    }
    return ok_response(payload)


@settings_bp.post("/settings")
def update_settings():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return error_response(ErrorCode.INVALID_SUBMISSION, "Body must be a JSON object.", 400)

    try:
        production_in = _validate_dict(body.get("production", {}), "production")
        countries_in = _validate_dict(body.get("countries", {}), "countries")
        global_in = _validate_dict(body.get("global", {}), "global")
        regions_in = _validate_dict(body.get("regions", {}), "regions")
        government_in = _validate_dict(body.get("government", {}), "government")
        numeric_config_in = _validate_dict(body.get("numericConfig", {}), "numericConfig")

        new_factory = _validate_int_map(
            production_in.get("newFactoryCosts", {}),
            _PRODUCTION_NEW_FACTORY_KEYS,
            "production.newFactoryCosts",
        )
        upgrade = _validate_int_map(
            production_in.get("upgradeCosts", {}),
            _PRODUCTION_UPGRADE_KEYS,
            "production.upgradeCosts",
        )
        country_values: dict[str, dict[str, int]] = {}
        for country, raw in countries_in.items():
            if country not in _COUNTRY_KEYS:
                raise _ValidationError(f"countries.{country} is not a recognized country.")
            country_dict = _validate_dict(raw, f"countries.{country}")
            country_values[country] = {
                "initialRawMaterials": _validate_non_negative_int(
                    country_dict.get("initialRawMaterials"),
                    f"countries.{country}.initialRawMaterials",
                ),
                "rawMaterialsPerTurn": _validate_non_negative_int(
                    country_dict.get("rawMaterialsPerTurn"),
                    f"countries.{country}.rawMaterialsPerTurn",
                ),
            }
        base_income = _validate_non_negative_int(
            global_in.get("baseIncomePerRound"), "global.baseIncomePerRound"
        )
        region_values: dict[str, float] = {}
        for region_id, raw_multiplier in regions_in.items():
            region_values[str(region_id)] = _validate_non_negative_float(
                raw_multiplier, f"regions.{region_id}"
            )

        admin_cost = _validate_non_negative_int(
            government_in.get("administrationCost"), "government.administrationCost"
        )
        ideology_min = _validate_int(
            government_in.get("ideologyMin"), "government.ideologyMin"
        )
        ideology_max = _validate_int(
            government_in.get("ideologyMax"), "government.ideologyMax"
        )
        if ideology_min > ideology_max:
            raise _ValidationError("government.ideologyMin must be <= government.ideologyMax.")
        shift_rules_in = _validate_dict(
            government_in.get("naturalShiftRules", {}), "government.naturalShiftRules"
        )
        shift_values: dict[str, dict[str, int]] = {}
        for ideology, raw_rule in shift_rules_in.items():
            if ideology not in _IDEOLOGY_KEYS:
                raise _ValidationError(
                    f"government.naturalShiftRules.{ideology} is not a recognized ideology."
                )
            rule_dict = _validate_dict(
                raw_rule, f"government.naturalShiftRules.{ideology}"
            )
            shift_values[ideology] = {
                "highThreshold": _validate_int(
                    rule_dict.get("highThreshold"),
                    f"government.naturalShiftRules.{ideology}.highThreshold",
                ),
                "lowThreshold": _validate_int(
                    rule_dict.get("lowThreshold"),
                    f"government.naturalShiftRules.{ideology}.lowThreshold",
                ),
            }
        numeric_updates = _validate_numeric_config_updates(
            numeric_config_in,
            config_dir=_config_dir(),
        )
    except _ValidationError as exc:
        return error_response(ErrorCode.INVALID_SUBMISSION, str(exc), 400)

    config_dir = _config_dir()

    production_path = config_dir / "production.json"
    production_data = _read_json(production_path)
    production_data.setdefault("newFactoryCosts", {}).update(new_factory)
    production_data.setdefault("upgradeCosts", {}).update(upgrade)
    _write_json(production_path, production_data)

    countries_path = config_dir / "countries.json"
    countries_data = _read_json(countries_path)
    for country, values in country_values.items():
        country_block = countries_data.setdefault("countries", {}).setdefault(country, {})
        country_block["initialRawMaterials"] = values["initialRawMaterials"]
        country_block["rawMaterialsPerTurn"] = values["rawMaterialsPerTurn"]
    _write_json(countries_path, countries_data)

    global_path = config_dir / "global.json"
    global_data = _read_json(global_path)
    global_data["baseIncomePerRound"] = base_income
    _write_json(global_path, global_data)

    regions_path = config_dir / "regions.json"
    regions_data = _read_json(regions_path)
    for region in regions_data.get("regions", []):
        if not isinstance(region, dict):
            continue
        region_id = str(region.get("regionId", ""))
        if region_id in region_values:
            region["priceMultiplier"] = region_values[region_id]
    _write_json(regions_path, regions_data)

    politics_path = config_dir / "politics.json"
    politics_data = _read_json(politics_path)
    politics_data["administrationCost"] = admin_cost
    politics_data["ideologyMin"] = ideology_min
    politics_data["ideologyMax"] = ideology_max
    for ideology, values in shift_values.items():
        rule_block = politics_data.setdefault("naturalShiftRules", {}).setdefault(ideology, {})
        rule_block["highThreshold"] = values["highThreshold"]
        rule_block["lowThreshold"] = values["lowThreshold"]
    _write_json(politics_path, politics_data)

    _apply_numeric_config_updates(config_dir=config_dir, updates=numeric_updates)

    _load_balance_config_cached.cache_clear()

    return ok_response({"updated": True})


def _config_dir() -> Path:
    raw = current_app.config.get("BALANCE_CONFIG_DIR")
    if not raw:
        raise RuntimeError("BALANCE_CONFIG_DIR is not configured.")
    return Path(str(raw)).resolve()


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _build_numeric_config_payload(config_dir: Path) -> dict[str, list[dict[str, Any]]]:
    payload: dict[str, list[dict[str, Any]]] = {}
    for path in sorted(config_dir.glob(f"*{_JSON_SUFFIX}")):
        data = _read_json(path)
        entries: list[dict[str, Any]] = []
        _collect_numeric_entries(data, [], entries, [])
        payload[path.name] = entries
    return payload


def _build_decision_sandbox_payload(
    config_dir: Path,
    numeric_config: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    with use_balance_config_dir(config_dir):
        game = create_game(room_code="SETTINGS")
        assignments = {
            "settings-britain": CountryCode.BRITAIN,
            "settings-france": CountryCode.FRANCE,
            "settings-prussia": CountryCode.PRUSSIA,
            "settings-austria": CountryCode.AUSTRIA,
            "settings-russia": CountryCode.RUSSIA,
        }
        snapshot = create_initial_snapshot(game=game, player_assignments=assignments)
        player = next(
            item for item in snapshot.player_states if item.player_id == "settings-britain"
        )
        workspace = snapshot.phase_workspace["players"][player.player_id]

    return {
        "countryId": "britain",
        "playerId": player.player_id,
        "roundNo": snapshot.round_no,
        "phase": snapshot.phase.value,
        "playerState": player.to_payload(),
        "decisionWorkspace": workspace,
        "parameterBindings": _build_parameter_bindings(config_dir, numeric_config, workspace),
    }


def _build_parameter_bindings(
    config_dir: Path,
    numeric_config: dict[str, list[dict[str, Any]]],
    workspace: dict[str, Any],
) -> list[dict[str, Any]]:
    raw_config = {
        path.name: _read_json(path)
        for path in sorted(config_dir.glob(f"*{_JSON_SUFFIX}"))
    }
    bindings: list[dict[str, Any]] = []

    def add_binding(
        target_key: str,
        title: str,
        current_effect: str,
        specs: list[tuple[str, list[str | int], bool]],
    ) -> None:
        sources = _resolve_binding_sources(numeric_config, specs)
        if not sources:
            return
        bindings.append(
            {
                "targetKey": target_key,
                "title": title,
                "currentEffect": current_effect,
                "sources": sources,
            }
        )

    production = raw_config.get("production.json", {})
    for route_id in ("handicraft", "mechanized", "steam", "electrified"):
        add_binding(
            f"factory.construction.expansion.{route_id}",
            f"工厂增加：{_SEGMENT_LABELS.get(route_id, route_id)}",
            "玩家按 + 后会安排 1 次扩建：立刻占用工厂预算；本回合不增加产量，下回合该阶段产能 +1。",
            [
                ("production.json", ["expansionCosts", route_id], False),
                ("production.json", ["outputMultipliers", route_id], False),
            ],
        )
        add_binding(
            f"factory.construction.newFactory.{route_id}",
            f"新建工厂：{_SEGMENT_LABELS.get(route_id, route_id)}",
            "玩家按 + 后会安排新建首座工厂：立刻占用工厂预算；本回合不增加产量，下回合该阶段产能 +2。",
            [
                ("production.json", ["newFactoryCosts", route_id], False),
                ("production.json", ["outputMultipliers", route_id], False),
            ],
        )
        add_binding(
            f"factory.construction.upgrade.{route_id}",
            f"产业升级：{_SEGMENT_LABELS.get(route_id, route_id)}",
            "玩家按 + 后会安排 1 次产业升级：立刻占用工厂预算，并把上一级 1 点产能转换为本阶段 1 点产能；这不是新增总产能。",
            [
                ("production.json", ["upgradeCosts", route_id], False),
                ("production.json", ["outputMultipliers", route_id], False),
            ],
        )

    for goods_id, goods in production.get("goods", {}).items():
        if isinstance(goods, dict):
            add_binding(
                f"factory.production.{goods_id}",
                f"生产：{goods.get('label') or goods_id}",
                "玩家分配原材料后会消耗工厂预算和原材料，并按单位产出生成库存；产出的商品会进入后续市场出售。",
                [("production.json", ["goods", goods_id], True)],
            )

    decision_actions = raw_config.get("decision_actions.json", {})
    for action in workspace.get("factoryActions", []) or []:
        action_id = str(action.get("actionId"))
        add_binding(
            f"factory.action.{action_id}",
            f"工厂调度：{action.get('label') or action_id}",
            f"玩家选择后会把这项临时调度加入本回合工厂计划：{action.get('description') or '影响本回合生产。'}",
            [("decision_actions.json", ["factoryActions", action_id], True)],
        )

    for action in workspace.get("governmentActions", {}).get("strategies", []) or []:
        action_id = str(action.get("actionId"))
        specs = [("decision_actions.json", ["governmentActions", action_id], True)]
        if action_id in (decision_actions.get("domesticMarketActions") or {}):
            specs.append(("decision_actions.json", ["domesticMarketActions", action_id], True))
        add_binding(
            f"government.strategy.{action_id}",
            f"政府/市场政策：{action.get('label') or action_id}",
            f"玩家选择后会把这项政府行动加入本回合计划：{action.get('description') or '改变财政、市场、研究或收入结构。'}",
            specs,
        )

    for action_id in ("market_subsidy", "price_control", "trade_promotion"):
        action = (decision_actions.get("governmentActions") or {}).get(action_id)
        if not isinstance(action, dict):
            continue
        add_binding(
            f"government.strategy.{action_id}",
            f"市场政策：{action.get('label') or action_id}",
            f"玩家选择后会消耗 1 点行政力，并只影响本回合市场预览和出售结果：{action.get('description') or '改变本轮市场参数。'}",
            [("decision_actions.json", ["governmentActions", action_id], True)],
        )

    reforms_cfg = raw_config.get("reforms.json", {})
    for path_key, reform_list in (reforms_cfg.get("reforms") or {}).items():
        if not isinstance(reform_list, list):
            continue
        for index, reform in enumerate(reform_list):
            if not isinstance(reform, dict):
                continue
            reform_id = str(reform.get("reformId") or "")
            if not reform_id:
                continue
            add_binding(
                f"government.reform.{reform_id}",
                f"国家路径：{reform.get('label') or reform_id}",
                f"玩家实施后会消耗行政力，并永久改变国家路径或解锁政策：{reform.get('description') or '带来制度效果。'}",
                [("reforms.json", ["reforms", path_key, index], True)],
            )

    for policy_id, policy in (decision_actions.get("regularPolicies") or {}).items():
        if not isinstance(policy, dict):
            continue
        add_binding(
            f"government.policy.{policy_id}",
            f"政府政策：{policy.get('label') or policy_id}",
            f"玩家激活后会占用本回合行政力，并在结算或本回合预览中改变收入分配、财政或思潮：{policy.get('description') or '政策效果。'}",
            [("decision_actions.json", ["regularPolicies", str(policy_id)], True)],
        )

    ability = workspace.get("nationalAbility")
    if isinstance(ability, dict) and ability.get("abilityId"):
        ability_id = str(ability["abilityId"])
        add_binding(
            f"government.ability.{ability_id}",
            f"国家能力：{ability.get('label') or ability_id}",
            f"玩家启用后会触发国家专属能力；通常每局次数有限：{ability.get('description') or '国家能力效果。'}",
            [("abilities.json", ["nationalAbilities", ability_id], True)],
        )

    add_binding(
        "government.adminPurchase",
        "购买行政力",
        "玩家按 + 后会用政府财政永久增加行政力上限；新增行政力本回合立刻可用于改革、政策和市场政策。",
        [("politics.json", ["administrationCost"], False)],
    )

    add_binding(
        "domestic.preview",
        "国内市场预览",
        "这里不是提交按钮，而是告诉玩家：按当前工厂产出和政府市场政策，本回合国内市场能买多少、价格大概是多少。",
        [
            ("market.json", [], True),
            ("production.json", ["goods"], True),
        ],
    )

    for action in workspace.get("militaryWorkspace", {}).get("availableMilitaryActions", []) or []:
        action_id = str(action.get("actionId"))
        add_binding(
            f"military.action.{action_id}",
            f"军事行动：{action.get('label') or action_id}",
            f"玩家选择后会消耗政府财政，并把军事变化加入本回合计划：{action.get('description') or '改变军力或海外市场能力。'}",
            [
                ("military_actions.json", ["militaryActions", action_id], True),
                ("military.json", [], True),
            ],
        )

    for action in workspace.get("militaryWorkspace", {}).get("availableDiplomacyActions", []) or []:
        action_id = str(action.get("actionId"))
        add_binding(
            f"military.diplomacy.{action_id}",
            f"外交行动：{action.get('label') or action_id}",
            f"玩家选择后会消耗政府财政建立外交关系；成功后目标区域贸易通道会长期开放：{action.get('description') or '外交行动。'}",
            [("military_actions.json", ["diplomacyActions", action_id], True)],
        )

    add_binding(
        "research.facility",
        "建立研究院",
        "玩家选择后会从政府财政支付成本，建设研究设施；之后每回合研究进度都会更快。",
        [
            ("technology.json", ["researchFacilityCost"], False),
            ("technology.json", ["researchFacilityProgressPerTurn"], False),
            ("technology.json", ["breakthroughDieSides"], False),
            ("decision_actions.json", ["governmentActions", "expand_research"], True),
        ],
    )

    technology_cfg = raw_config.get("technology.json", {})
    for chain_id, chain in (technology_cfg.get("chains") or {}).items():
        techs = chain.get("techs") if isinstance(chain, dict) else None
        if not isinstance(techs, list):
            continue
        for index, tech in enumerate(techs):
            if not isinstance(tech, dict):
                continue
            tech_id = str(tech.get("id") or "")
            if not tech_id:
                continue
            add_binding(
                f"research.tech.{tech_id}",
                f"科技研究：{tech.get('label') or tech_id}",
                "玩家选择后会把该科技设为研究目标；研究进度达到门槛后，会进入突破或追赶解锁逻辑，并可能开放新产业阶段。",
                [
                    ("technology.json", ["chains", str(chain_id), "techs", index, "threshold"], False),
                    ("technology.json", ["breakthroughDieSides"], False),
                ],
            )

    return bindings


def _resolve_binding_sources(
    numeric_config: dict[str, list[dict[str, Any]]],
    specs: list[tuple[str, list[str | int], bool]],
) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for file_name, path_prefix, include_children in specs:
        for entry in numeric_config.get(file_name, []):
            entry_path = entry.get("path")
            if not isinstance(entry_path, list):
                continue
            matched = (
                _path_starts_with(entry_path, path_prefix)
                if include_children
                else entry_path == path_prefix
            )
            if not matched:
                continue
            key = (file_name, json.dumps(entry_path, ensure_ascii=False))
            if key in seen:
                continue
            seen.add(key)
            sources.append(
                {
                    "fileName": file_name,
                    "path": entry_path,
                    "pathLabel": entry.get("pathLabel"),
                    "label": entry.get("label"),
                    "contextLabel": entry.get("contextLabel"),
                    "fieldLabel": entry.get("fieldLabel"),
                    "value": entry.get("value"),
                }
            )
    return sources


def _path_starts_with(path: list[Any], prefix: list[str | int]) -> bool:
    if not prefix:
        return True
    if len(path) < len(prefix):
        return False
    return path[: len(prefix)] == prefix


def _collect_numeric_entries(
    value: Any,
    path: list[str | int],
    entries: list[dict[str, Any]],
    context_labels: list[str],
) -> None:
    if isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        field_label = _numeric_field_label(path)
        context_label = " / ".join(context_labels)
        label = f"{context_label} - {field_label}" if context_label else field_label
        entries.append(
            {
                "path": list(path),
                "pathLabel": _format_numeric_path(path),
                "label": label,
                "contextLabel": context_label,
                "fieldLabel": field_label,
                "value": value,
            }
        )
        return
    if isinstance(value, dict):
        for key, child in value.items():
            child_context = context_labels
            if not _is_numeric_leaf(child):
                child_context = _append_context_labels(
                    context_labels,
                    _context_labels_for_child(str(key), child),
                )
            _collect_numeric_entries(child, [*path, str(key)], entries, child_context)
        return
    if isinstance(value, list):
        for index, child in enumerate(value):
            child_context = context_labels
            if not _is_numeric_leaf(child):
                child_context = _append_context_labels(
                    context_labels,
                    _context_labels_for_list_item(child, index),
                )
            _collect_numeric_entries(child, [*path, index], entries, child_context)


def _is_numeric_leaf(value: Any) -> bool:
    return not isinstance(value, bool) and isinstance(value, (int, float))


def _append_context_labels(base: list[str], labels: list[str]) -> list[str]:
    result = list(base)
    for label in labels:
        if label and label not in result:
            result.append(label)
    return result


def _context_labels_for_child(key: str, child: Any) -> list[str]:
    labels: list[str] = []
    container_label = _CONTEXT_LABELS.get(key)
    segment_label = _SEGMENT_LABELS.get(key)
    object_label = _object_context_label(child)

    if container_label:
        labels.append(container_label)
    if segment_label and segment_label != object_label:
        labels.append(segment_label)
    if object_label:
        labels.append(object_label)
    return labels


def _context_labels_for_list_item(child: Any, index: int) -> list[str]:
    object_label = _object_context_label(child)
    if object_label:
        return [object_label]
    if isinstance(child, dict):
        return [f"第 {index + 1} 项"]
    return []


def _object_context_label(value: Any) -> str | None:
    if not isinstance(value, dict):
        return None
    for label_key in ("label", "name", "title"):
        label = value.get(label_key)
        if isinstance(label, str) and label:
            return label
    for id_key in ("regionId", "nodeId", "abilityId", "eventId", "reformId", "id", "branch"):
        raw_id = value.get(id_key)
        if isinstance(raw_id, str) and raw_id:
            return _SEGMENT_LABELS.get(raw_id, raw_id)
    return None


def _numeric_field_label(path: list[str | int]) -> str:
    if len(path) >= 2 and path[-2] == "roundRange" and path[-1] == 0:
        return "开始回合"
    if len(path) >= 2 and path[-2] == "roundRange" and path[-1] == 1:
        return "结束回合"
    last = path[-1]
    if isinstance(last, int):
        return f"第 {last + 1} 个数值"
    raw = str(last)
    return _FIELD_LABELS.get(raw) or _SEGMENT_LABELS.get(raw) or raw


def _format_numeric_path(path: list[str | int]) -> str:
    label = ""
    for segment in path:
        if isinstance(segment, int):
            label += f"[{segment}]"
        else:
            label = segment if not label else f"{label}.{segment}"
    return label


def _validate_numeric_config_updates(
    value: dict[str, Any],
    *,
    config_dir: Path,
) -> dict[str, list[dict[str, Any]]]:
    allowed_files = {path.name for path in config_dir.glob(f"*{_JSON_SUFFIX}")}
    result: dict[str, list[dict[str, Any]]] = {}
    for file_name, raw_entries in value.items():
        if file_name not in allowed_files:
            raise _ValidationError(f"numericConfig.{file_name} is not a recognized config file.")
        if not isinstance(raw_entries, list):
            raise _ValidationError(f"numericConfig.{file_name} must be a list.")
        file_payload = _read_json(config_dir / str(file_name))
        entries: list[dict[str, Any]] = []
        for index, raw_entry in enumerate(raw_entries):
            entry = _validate_dict(raw_entry, f"numericConfig.{file_name}[{index}]")
            raw_path = entry.get("path")
            if not isinstance(raw_path, list) or not raw_path:
                raise _ValidationError(f"numericConfig.{file_name}[{index}].path must be a non-empty list.")
            path: list[str | int] = []
            for path_index, segment in enumerate(raw_path):
                if isinstance(segment, bool) or not isinstance(segment, (str, int)):
                    raise _ValidationError(
                        f"numericConfig.{file_name}[{index}].path[{path_index}] must be a string or integer."
                    )
                path.append(segment)
            raw_value = entry.get("value")
            if isinstance(raw_value, bool) or not isinstance(raw_value, (int, float)):
                raise _ValidationError(f"numericConfig.{file_name}[{index}].value must be a number.")
            existing = _get_value_at_path(
                file_payload,
                path,
                f"numericConfig.{file_name}[{index}]",
            )
            coerced_value = _coerce_numeric_value(
                raw_value,
                existing,
                f"numericConfig.{file_name}[{index}]",
            )
            entries.append({"path": path, "value": coerced_value})
        result[str(file_name)] = entries
    return result


def _apply_numeric_config_updates(
    *,
    config_dir: Path,
    updates: dict[str, list[dict[str, Any]]],
) -> None:
    for file_name, entries in updates.items():
        if not entries:
            continue
        path = config_dir / file_name
        data = _read_json(path)
        for entry in entries:
            _set_numeric_value(data, entry["path"], entry["value"], f"numericConfig.{file_name}")
        _write_json(path, data)


def _set_numeric_value(
    data: Any,
    path: list[str | int],
    raw_value: int | float,
    field_name: str,
) -> None:
    target = data
    for segment in path[:-1]:
        if isinstance(segment, int):
            if not isinstance(target, list) or segment < 0 or segment >= len(target):
                raise _ValidationError(f"{field_name}.{_format_numeric_path(path)} does not exist.")
            target = target[segment]
        else:
            if not isinstance(target, dict) or segment not in target:
                raise _ValidationError(f"{field_name}.{_format_numeric_path(path)} does not exist.")
            target = target[segment]

    final_segment = path[-1]
    if isinstance(final_segment, int):
        if not isinstance(target, list) or final_segment < 0 or final_segment >= len(target):
            raise _ValidationError(f"{field_name}.{_format_numeric_path(path)} does not exist.")
        existing = target[final_segment]
        target[final_segment] = _coerce_numeric_value(raw_value, existing, field_name)
        return

    if not isinstance(target, dict) or final_segment not in target:
        raise _ValidationError(f"{field_name}.{_format_numeric_path(path)} does not exist.")
    existing = target[final_segment]
    target[final_segment] = _coerce_numeric_value(raw_value, existing, field_name)


def _get_value_at_path(data: Any, path: list[str | int], field_name: str) -> Any:
    target = data
    for segment in path:
        if isinstance(segment, int):
            if not isinstance(target, list) or segment < 0 or segment >= len(target):
                raise _ValidationError(f"{field_name}.path does not exist.")
            target = target[segment]
        else:
            if not isinstance(target, dict) or segment not in target:
                raise _ValidationError(f"{field_name}.path does not exist.")
            target = target[segment]
    return target


def _coerce_numeric_value(raw_value: int | float, existing: Any, field_name: str) -> int | float:
    if isinstance(existing, bool) or not isinstance(existing, (int, float)):
        raise _ValidationError(f"{field_name} target is not numeric.")
    if isinstance(existing, int):
        if float(raw_value) % 1 != 0:
            raise _ValidationError(f"{field_name} target expects an integer.")
        return int(raw_value)
    return float(raw_value)


def _validate_dict(value: Any, field_name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise _ValidationError(f"{field_name} must be an object.")
    return value


def _validate_int_map(
    value: Any, allowed_keys: tuple[str, ...], field_name: str
) -> dict[str, int]:
    mapping = _validate_dict(value, field_name)
    result: dict[str, int] = {}
    for key in allowed_keys:
        if key not in mapping:
            continue
        result[key] = _validate_non_negative_int(mapping[key], f"{field_name}.{key}")
    return result


def _validate_non_negative_int(value: Any, field_name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise _ValidationError(f"{field_name} must be a non-negative number.")
    if value < 0:
        raise _ValidationError(f"{field_name} must be >= 0.")
    return int(value)


def _validate_int(value: Any, field_name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise _ValidationError(f"{field_name} must be a number.")
    return int(value)


def _validate_non_negative_float(value: Any, field_name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise _ValidationError(f"{field_name} must be a non-negative number.")
    if value < 0:
        raise _ValidationError(f"{field_name} must be >= 0.")
    return float(value)
