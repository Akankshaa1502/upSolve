/** Standard success envelope: { ok: true, data }. */
export function ok(res, data, status = 200) {
  return res.status(status).json({ ok: true, data });
}
