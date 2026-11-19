// getRandomValues works on HTTP LAN hosts as well as secure origins.
export function testId() {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) =>
    value.toString(16).padStart(8, "0"),
  ).join("-");
}
