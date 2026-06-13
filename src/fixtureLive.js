/** Merge static fixture catalog row with live ESPN snapshot. */

export function mergeFixtureWithLive(base, live) {
  if (!base) return base;
  if (!live) return base;
  return {
    ...base,
    ...live,
    homeTeam: base.homeTeam,
    awayTeam: base.awayTeam,
    id: base.id
  };
}

export function mergeCatalogWithLive(catalog, liveById) {
  if (!catalog || !liveById) return catalog;
  const patch = (list) =>
    (list ?? []).map((f) => (f?.id && liveById[f.id] ? mergeFixtureWithLive(f, liveById[f.id]) : f));

  return {
    ...catalog,
    groupStage: patch(catalog.groupStage),
    knockout: patch(catalog.knockout)
  };
}
