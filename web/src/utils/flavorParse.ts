export interface FlavorLike {
  id: number;
  flavor: string;
}

export interface FlavorParseResult {
  quantities: Record<number, string>;
  matched: number;
  unmatched: string[];
}

/** 把「口味 + 数量」的多行文本解析成口味数量；按仓库口味名匹配 */
export function parseFlavorQuantities(
  text: string,
  flavors: FlavorLike[]
): FlavorParseResult {
  const normalizeName = (name: string) =>
    name.replace(/^\s*\d+[.、]\s*/, '').trim();
  const normalizeLine = (line: string) =>
    line
      .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10))
      .trim();

  const items = flavors.map((flavor) => ({
    flavor,
    name: flavor.flavor.trim(),
    short: normalizeName(flavor.flavor),
  }));

  const resolveFlavor = (name: string) => {
    const key = name.trim();
    const exact = items.find((item) => item.name === key || item.short === key);
    if (exact) return exact.flavor;
    const fuzzy = items.filter(
      (item) =>
        item.name.includes(key) ||
        key.includes(item.name) ||
        item.short.includes(key) ||
        key.includes(item.short)
    );
    return fuzzy.length === 1 ? fuzzy[0].flavor : null;
  };

  const candidates = items.flatMap((item) => {
    const list = [{ name: item.name, flavor: item.flavor }];
    if (item.short && item.short !== item.name) {
      list.push({ name: item.short, flavor: item.flavor });
    }
    return list;
  });
  candidates.sort((a, b) => b.name.length - a.name.length);

  const quantities: Record<number, string> = {};
  const unmatched: string[] = [];
  let matched = 0;

  for (const raw of text.split(/\r?\n/)) {
    const base = normalizeLine(raw);
    if (!base) continue;
    const variants = [
      base,
      base.replace(/^\s*\d+[.、]\s*/, '').trim(),
      base.replace(/^[\s\-*•·]+/, '').trim(),
    ].filter((item, index, list) => item && list.indexOf(item) === index);

    let found = false;
    for (const line of variants) {
      for (const candidate of candidates) {
        if (!line.startsWith(candidate.name)) continue;
        let rest = line.slice(candidate.name.length).trim();
        rest = rest.replace(/^[\s:：,，、*xX×\-/]+/, '').trim();
        const match = rest.match(
          /^([0-9]+(?:\.[0-9]+)?)\s*(?:个|件|箱|包|份|斤|公斤|kg|KG)?[\s,，、]*$/
        );
        if (!match) continue;
        const quantity = Number(match[1]);
        if (!Number.isFinite(quantity)) continue;
        quantities[candidate.flavor.id] = String(quantity);
        matched += 1;
        found = true;
        break;
      }
      if (found) break;
    }
    if (found) continue;

    for (const line of variants) {
      const parsed = line.match(
        /^(.*?)[\s:：,，、*xX×\-/]+([0-9]+(?:\.[0-9]+)?)\s*(?:个|件|箱|包|份|斤|公斤|kg|KG)?[\s,，、]*$/
      );
      if (!parsed) continue;
      const flavor = resolveFlavor(parsed[1].trim());
      const quantity = Number(parsed[2]);
      if (!flavor || !Number.isFinite(quantity)) continue;
      quantities[flavor.id] = String(quantity);
      matched += 1;
      found = true;
      break;
    }
    if (!found) unmatched.push(base);
  }

  return { quantities, matched, unmatched };
}
