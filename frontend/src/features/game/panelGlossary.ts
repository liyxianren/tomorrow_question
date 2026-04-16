const countryLabels: Record<string, string> = {
  austria: "奥地利",
  britain: "英国",
  france: "法国",
  prussia: "普鲁士",
  russia: "俄罗斯",
};

const productionRouteLabels: Record<string, string> = {
  idle: "空置产能",
  handicraft: "手工业",
  mechanized: "机械化工业",
  steam: "蒸汽工业",
  electrified: "电气工业",
};

const goodsLabels: Record<string, string> = {
  arms: "军火",
  coal: "煤炭",
  cotton: "棉花",
  grain: "粮食",
  iron: "铁矿",
  luxuryGoods: "奢侈品",
  luxury_goods: "奢侈品",
  oil: "石油",
  ships: "船舶",
  steel: "钢材",
  textile: "纺织品",
  timber: "木材",
  tools: "工具",
};

const accessLevelLabels: Record<string, string> = {
  closed: "对外关闭",
  colony: "殖民控制",
  concession: "特许经营",
  open: "开放贸易",
};

const ideologyLabels: Record<string, string> = {
  conservatism: "保守主义",
  egalitarianism: "平等主义",
  liberalism: "自由主义",
  monarchy: "君主主义",
  nationalism: "民族主义",
  republicanism: "共和主义",
  socialism: "社会主义",
};

const reformLabels: Record<string, string> = {
  "civil service": "文官制度",
  "factory act": "工厂法",
  "land reform": "土地改革",
  "public schools": "公立学校",
};

const policyLabels: Record<string, string> = {
  "free trade": "自由贸易",
  "naval act": "海军法",
  "press controls": "新闻管制",
  "protective tariffs": "保护性关税",
};

const technologyLabels: Record<string, string> = {
  spinning_jenny: "珍妮纺纱机",
  steam_engine: "蒸汽机",
  steelmaking: "炼钢法",
};

const researchFacilityLabels: Record<string, string> = {
  academy: "学院",
  public_labs: "公共实验室",
};

const regionLabels: Record<string, string> = {
  balkans: "巴尔干",
  india: "印度",
};

const oceanNodeLabels: Record<string, string> = {
  mediterranean: "地中海",
  "north-sea": "北海",
};

const routeLabels: Record<string, string> = {
  atlantic: "大西洋",
  baltic: "波罗的海",
  suez: "苏伊士",
};

const unitLabels: Record<string, string> = {
  artillery: "火炮",
  cavalry: "骑兵",
  frigates: "护卫舰",
  infantry: "步兵",
  ironclads: "铁甲舰",
};

function humanizeKey(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function createReverseLookup(record: Record<string, string>): Record<string, string> {
  return Object.entries(record).reduce<Record<string, string>>((lookup, [key, label]) => {
    lookup[label] = key;
    return lookup;
  }, {});
}

const reformReverseLookup = createReverseLookup(reformLabels);
const policyReverseLookup = createReverseLookup(policyLabels);

function resolveLabel(record: Record<string, string>, value: string): string {
  return record[value] ?? humanizeKey(value);
}

export function getCountryLabel(value: string | null | undefined): string {
  if (!value) {
    return "无";
  }

  return resolveLabel(countryLabels, value);
}

export function getProductionRouteLabel(value: string): string {
  return resolveLabel(productionRouteLabels, value);
}

export function getGoodsLabel(value: string): string {
  return resolveLabel(goodsLabels, value);
}

export function getAccessLevelLabel(value: string): string {
  return resolveLabel(accessLevelLabels, value);
}

export function getIdeologyLabel(value: string): string {
  return resolveLabel(ideologyLabels, value);
}

export function getReformLabel(value: string): string {
  return resolveLabel(reformLabels, value);
}

export function getPolicyLabel(value: string): string {
  return resolveLabel(policyLabels, value);
}

export function getTechnologyLabel(value: string): string {
  return resolveLabel(technologyLabels, value);
}

export function getResearchFacilityLabel(value: string): string {
  return resolveLabel(researchFacilityLabels, value);
}

export function getRegionLabel(value: string): string {
  return resolveLabel(regionLabels, value);
}

export function getOceanNodeLabel(value: string): string {
  return resolveLabel(oceanNodeLabels, value);
}

export function getRouteLabel(value: string): string {
  return resolveLabel(routeLabels, value);
}

export function getUnitLabel(value: string): string {
  return resolveLabel(unitLabels, value);
}

export function formatTranslatedAgenda(
  items: string[],
  getLabel: (value: string) => string,
): string {
  return items.map((item) => getLabel(item)).join("\n");
}

export function resolveReformKey(value: string): string {
  return reformReverseLookup[value] ?? value.trim();
}

export function resolvePolicyKey(value: string): string {
  return policyReverseLookup[value] ?? value.trim();
}
