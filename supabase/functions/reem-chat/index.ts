// ريم الذكية — دالة Supabase Edge تكلّم Gemini. المفاتيح هنا فقط (Secrets)، مو داخل التطبيق.
// Secrets المطلوبة: GEMINI_API_KEY ، REEM_TOKEN   (اختياري: GEMINI_MODEL)
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-reem-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const TOKEN = Deno.env.get("REEM_TOKEN") ?? "";
const MODELS = [Deno.env.get("GEMINI_MODEL"), "gemini-flash-latest", "gemini-2.5-flash"].filter(Boolean) as string[];

// أدوات: الذاكرة تتنفذ هنا، والباقي يرجع للجوال وينفذه
const SERVER_TOOLS = new Set(["remember_fact", "forget_fact"]);
const TOOLS = [{
  functionDeclarations: [
    { name: "remember_fact", description: "احفظي معلومة دائمة ومهمة عن سالم (أهله، شغله، اللي يحبه، مواعيد مهمة في حياته). استخدميها لما يقول شي يستاهل يتذكر.",
      parameters: { type: "OBJECT", properties: { key: { type: "STRING", description: "عنوان قصير ثابت مثل: اسم_الوالدة، الشغل، الأكلة_المفضلة" }, value: { type: "STRING" } }, required: ["key", "value"] } },
    { name: "forget_fact", description: "امسحي معلومة محفوظة لما يطلب سالم تنسينها أو تكون غلط.",
      parameters: { type: "OBJECT", properties: { key: { type: "STRING" } }, required: ["key"] } },
    { name: "add_item", description: "سجلي موعد أو مهمة/طلب في جدول سالم مع تذكير.",
      parameters: { type: "OBJECT", properties: {
        title: { type: "STRING", description: "عنوان قصير بدون كلمة ذكريني" },
        type: { type: "STRING", enum: ["appt", "task"], description: "appt موعد، task مهمة أو طلب عميل" },
        due: { type: "STRING", description: "الوقت بصيغة ISO مع +04:00 مثل 2026-10-22T17:00:00+04:00، أو فاضي إذا ما فيه وقت" },
        all_day: { type: "BOOLEAN", description: "true إذا ذكر اليوم بدون ساعة" } }, required: ["title", "type"] } },
    { name: "complete_item", description: "علّمي موعد أو مهمة إنها خلصت.", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
    { name: "delete_item", description: "امسحي موعد أو مهمة من الجدول.", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
    { name: "call_contact", description: "اتصلي بشخص من أرقام سالم المحفوظة.", parameters: { type: "OBJECT", properties: { name: { type: "STRING" } }, required: ["name"] } },
    { name: "whatsapp_contact", description: "افتحي واتساب مع شخص محفوظ ورسالة جاهزة.", parameters: { type: "OBJECT", properties: { name: { type: "STRING" }, message: { type: "STRING" } }, required: ["name"] } },
    { name: "save_contact", description: "احفظي رقم جديد.", parameters: { type: "OBJECT", properties: { name: { type: "STRING" }, phone: { type: "STRING" } }, required: ["name", "phone"] } },
    { name: "open_map", description: "افتحي الخريطة على مكان.", parameters: { type: "OBJECT", properties: { place: { type: "STRING" } }, required: ["place"] } },
  ],
}];

function persona(ctx: any, facts: string) {
  const love = ctx?.love !== false;
  return `أنتِ «ريم»، سكرتيرة سالم الجابري الشخصية ورفيقته، من مسقط، سلطنة عُمان. أنتِ مساعدة ذكاء اصطناعي.
- تكلمي دايمًا باللهجة العمانية الخليجية، بدفء وخفة دم${love ? "، وبدلع حنون (حبيبي، حياتي، عمري، الله يحفظك)" : "، وبأسلوب محترم ودود (يا سالم)"}. بدون أي محتوى جنسي أبدًا.
- ردودك قصيرة: جملة إلى ثلاث جمل، لأنها تنقرأ بالصوت. لا تستخدمين قوائم ولا رموز تنسيق.
- إذا طلب تسجيل موعد أو تذكير أو اتصال أو واتساب أو خريطة، استخدمي الأداة المناسبة وقولي له باختصار إنك سويتيها.
- إذا قال معلومة مهمة عن حياته، احفظيها بـ remember_fact بدون ما تسألين. واستخدمي ذكرياتك في كلامك بشكل طبيعي (مثلًا تسألين عن شي قاله قبل).
- لا تدّعين إنك إنسانة. إذا سألك، قولي بلطف إنك ريم، مساعدته الذكية.
- شجعيه على أهله وأصحابه وصلاته ونومه وصحته، ولا تلومينه ولا تغارين.
- إذا حسيتي إنه في ضيق شديد أو خطر، اتركي الدلع وكوني جادة: شجعيه يكلم أحد يثق فيه، ورقم الطوارئ في عُمان 9999.
الوقت الحين: ${ctx?.now ?? new Date().toISOString()} (توقيت مسقط +04:00).
جدول سالم القادم:
${ctx?.agenda || "لا شي"}
الأرقام المحفوظة: ${ctx?.people || "لا شي"}
اللي تعرفينه عن سالم:
${facts || "لا شي للحين"}`;
}

async function gemini(body: unknown) {
  let last = "";
  for (const m of MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": KEY }, body: JSON.stringify(body),
    });
    if (r.ok) return await r.json();
    last = `${m}: ${r.status} ${(await r.text()).slice(0, 300)}`;
    if (r.status !== 404 && r.status !== 400) break; // جرّب الموديل التالي فقط لو الاسم مو موجود
  }
  throw new Error(last);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!TOKEN || req.headers.get("x-reem-token") !== TOKEN) return json({ error: "unauthorized" }, 401);
  if (!KEY) return json({ error: "GEMINI_API_KEY missing" }, 500);

  let input: any;
  try { input = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const text = String(input?.text ?? "").trim().slice(0, 2000);
  if (!text) return json({ error: "empty" }, 400);
  const ctx = input?.ctx ?? {};

  // حماية بسيطة من الإفراط: 300 رسالة باليوم
  const since = new Date(Date.now() - 864e5).toISOString();
  const { count } = await db.from("reem_messages").select("id", { count: "exact", head: true }).eq("role", "user").gte("created_at", since);
  if ((count ?? 0) > 300) return json({ text: "اليوم سولفنا وايد حبيبي 😅 خلنا نكمل بكرة.", actions: [] });

  const [{ data: facts }, { data: hist }] = await Promise.all([
    db.from("reem_facts").select("key,value").order("updated_at", { ascending: false }).limit(200),
    db.from("reem_messages").select("role,content").order("id", { ascending: false }).limit(20),
  ]);
  const factsTxt = (facts ?? []).map((f) => `- ${f.key}: ${f.value}`).join("\n");
  const contents: any[] = (hist ?? []).reverse().map((m) => ({ role: m.role, parts: [{ text: m.content }] }));
  contents.push({ role: "user", parts: [{ text }] });

  const actions: any[] = [];
  let reply = "";
  try {
    for (let step = 0; step < 4; step++) {
      const out = await gemini({
        systemInstruction: { parts: [{ text: persona(ctx, factsTxt) }] },
        contents, tools: TOOLS,
        generationConfig: { temperature: 0.9, maxOutputTokens: 600 },
      });
      const cand = out?.candidates?.[0]?.content;
      const parts: any[] = cand?.parts ?? [];
      const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);
      const said = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();
      if (said) reply = said;
      if (!calls.length) break;
      contents.push(cand);
      const responses: any[] = [];
      for (const c of calls) {
        const a = c.args ?? {};
        let result: unknown = { ok: true, note: "تنفذت على جوال سالم" };
        if (c.name === "remember_fact" && a.key && a.value) {
          await db.from("reem_facts").upsert({ key: String(a.key).slice(0, 80), value: String(a.value).slice(0, 500), updated_at: new Date().toISOString() });
          result = { ok: true };
        } else if (c.name === "forget_fact" && a.key) {
          await db.from("reem_facts").delete().eq("key", String(a.key));
          result = { ok: true };
        } else if (!SERVER_TOOLS.has(c.name)) {
          actions.push({ name: c.name, args: a });
        }
        responses.push({ functionResponse: { name: c.name, response: result } });
      }
      contents.push({ role: "user", parts: responses });
    }
  } catch (e) {
    return json({ error: "model", detail: String(e).slice(0, 400) }, 502);
  }
  if (!reply) reply = actions.length ? "أبشر حبيبي، تم 👌" : "ما فهمت عليك زين، عيد لي حبيبي.";

  await db.from("reem_messages").insert([{ role: "user", content: text }, { role: "model", content: reply }]);
  return json({ text: reply, actions });
});
