const fs = require("fs");
const M = "C:/Users/zifeng/AppData/Local/Temp/opencode/w2a-v4290/internal/app/messages.go";
const C = "C:/Users/zifeng/AppData/Local/Temp/opencode/w2a-v4290/internal/app/conversation.go";

function must(cond, msg) { if (!cond) { console.error("FAIL: " + msg); process.exit(1); } }

// ---------- Patch B v2: messages.go first-turn bridge ----------
let s = fs.readFileSync(M, "utf8");

const a1 = '"[System instruction]: You have access to tools. "+';
must(s.split(a1).length === 2, "anchor1 not unique");
s = s.replace(a1, "bridgeHeader+");

const a2 = "func randHex(n int) string {";
must(s.split(a2).length === 2, "anchor2 not unique");
const block =
'var toolPromptOld = os.Getenv("W2A_TOOL_PROMPT") == "old"\n' +
'\n' +
'var bridgeHeader = "# Tool Use\\n\\n" +\n' +
'\t"The following tools are connected through the host protocol: a client program " +\n' +
'\t"really executes each fenced tool_call and returns the actual result as the next " +\n' +
'\t"message ([Tool result for ...]). This is not a simulation, and there is no " +\n' +
'\t"server-side call quota. If one turn already contains many calls, finish the " +\n' +
'\t"current step and simply continue in the next turn.\\n\\n"\n' +
'\n' +
'func init() {\n' +
'\tif toolPromptOld {\n' +
'\t\tbridgeHeader = "[System instruction]: You have access to tools. "\n' +
'\t}\n' +
'}\n' +
'\n';
s = s.replace(a2, block + a2);

const head = s.split("func randHex")[0];
if (!/^\s*"os"\s*$/m.test(head)) {
  const imp = s.includes("import (\r\n") ? "import (\r\n" : "import (\n";
  must(s.includes(imp), "import block not found");
  s = s.replace(imp, imp + '\t"os"\n');
}

fs.writeFileSync(M, s, "utf8");
console.log("messages.go patched (v2)");

// ---------- Patch A v2: conversation.go continuation reminder ----------
let c = fs.readFileSync(C, "utf8");

const a3 = "\t\tprompt = formatNewTurn(messages[len(messages)-1])";
must(c.split(a3).length === 2, "anchor3 not unique");
const reminder = a3 + "\n" +
'\t\tif len(tools) > 0 && !toolPromptOld {\n' +
'\t\t\tvar tnames []string\n' +
'\t\t\tfor _, tool := range tools {\n' +
'\t\t\t\tfn := tool\n' +
'\t\t\t\tif t, ok := tool["type"].(string); ok && t == "function" {\n' +
'\t\t\t\t\tif f, ok := tool["function"].(map[string]interface{}); ok {\n' +
'\t\t\t\t\t\tfn = f\n' +
'\t\t\t\t\t}\n' +
'\t\t\t\t}\n' +
'\t\t\t\tif n := getStr(fn, "name"); n != "" {\n' +
'\t\t\t\t\ttnames = append(tnames, n)\n' +
'\t\t\t\t}\n' +
'\t\t\t}\n' +
'\t\t\tif len(tnames) > 0 {\n' +
'\t\t\t\tprompt = "# Tool Use\\n\\n" +\n' +
'\t\t\t\t\t"The tools remain connected through the host protocol: " + strings.Join(tnames, ", ") + ".\\n" +\n' +
'\t\t\t\t\t"Fenced tool_call blocks are really executed by the client program and the results " +\n' +
'\t\t\t\t\t"arrive as [Tool result] messages. There is no call quota; any earlier statement " +\n' +
'\t\t\t\t\t"about an exhausted quota was mistaken. If this turn feels heavy, finish the " +\n' +
'\t\t\t\t\t"current step and continue in the next turn.\\n\\n" + prompt\n' +
'\t\t\t}\n' +
'\t\t}\n';
c = c.replace(a3, reminder);

fs.writeFileSync(C, c, "utf8");
console.log("conversation.go patched (v2)");
console.log("V2-ALL-PATCHES-APPLIED");
