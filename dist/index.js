//#region src/model.ts
var e = {
	on: !1,
	method: "usm",
	contrast: 20,
	blurRadius: .2,
	radius: .5,
	amount: 200,
	thresholdBottomLeft: 20,
	thresholdTopLeft: 80,
	thresholdBottomRight: 2e3,
	thresholdTopRight: 1200,
	edgesOnly: !1,
	edgesRadius: 1.9,
	edgesTolerance: 1800,
	haloControl: !1,
	haloAmount: 85,
	deconvRadius: .75,
	deconvAmount: 100,
	deconvDamping: 0,
	deconvIterations: 30
}, t = {
	contrast: {
		min: 0,
		max: 200,
		step: 1
	},
	blurRadius: {
		min: .2,
		max: 2,
		step: .05
	},
	radius: {
		min: .3,
		max: 3,
		step: .01
	},
	amount: {
		min: 1,
		max: 1e3,
		step: 1
	},
	thresholdBottomLeft: {
		min: 0,
		max: 2e3,
		step: 1
	},
	thresholdTopLeft: {
		min: 0,
		max: 2e3,
		step: 1
	},
	thresholdBottomRight: {
		min: 0,
		max: 2e3,
		step: 1
	},
	thresholdTopRight: {
		min: 0,
		max: 2e3,
		step: 1
	},
	edgesRadius: {
		min: .5,
		max: 2.5,
		step: .1
	},
	edgesTolerance: {
		min: 10,
		max: 1e4,
		step: 100
	},
	haloAmount: {
		min: 1,
		max: 100,
		step: 1
	},
	deconvRadius: {
		min: .4,
		max: 2.5,
		step: .01
	},
	deconvAmount: {
		min: 0,
		max: 100,
		step: 1
	},
	deconvDamping: {
		min: 0,
		max: 100,
		step: 1
	},
	deconvIterations: {
		min: 5,
		max: 100,
		step: 1
	}
}, n = .25, r = .6, i = .84, a = 1.15, o = .25;
function s(e, t) {
	return e < .25 ? "skip" : e < .6 ? "3x3" : t !== "standard" && e <= .84 ? "5x5" : t !== "standard" && e <= 1.15 ? "7x7" : "iir";
}
var c = (e) => e === "iir" ? 2 : 1, l = [
	{
		sigma: .5,
		r: 1,
		a: [
			1,
			7,
			7,
			55
		]
	},
	{
		sigma: .6,
		r: 1,
		a: [
			1,
			4,
			4,
			16
		]
	},
	{
		sigma: .7,
		r: 2,
		a: [
			0,
			0,
			1,
			0,
			8,
			21,
			1,
			21,
			59
		]
	},
	{
		sigma: .8,
		r: 2,
		a: [
			0,
			0,
			1,
			0,
			5,
			10,
			1,
			10,
			23
		]
	},
	{
		sigma: .9,
		r: 2,
		a: [
			0,
			1,
			2,
			1,
			6,
			12,
			2,
			12,
			22
		]
	},
	{
		sigma: 1,
		r: 2,
		a: [
			0,
			1,
			2,
			1,
			4,
			7,
			2,
			7,
			12
		]
	},
	{
		sigma: 1.1,
		r: 3,
		a: [
			0,
			0,
			1,
			1,
			0,
			2,
			5,
			8,
			1,
			5,
			18,
			27,
			1,
			8,
			27,
			41
		]
	},
	{
		sigma: 1.2,
		r: 3,
		a: [
			0,
			0,
			1,
			1,
			0,
			1,
			4,
			6,
			1,
			4,
			11,
			16,
			1,
			6,
			16,
			23
		]
	},
	{
		sigma: 1.3,
		r: 3,
		a: [
			0,
			0,
			1,
			1,
			0,
			2,
			4,
			6,
			1,
			4,
			11,
			14,
			1,
			6,
			14,
			19
		]
	},
	{
		sigma: 1.4,
		r: 3,
		a: [
			0,
			1,
			2,
			3,
			1,
			4,
			8,
			10,
			2,
			8,
			17,
			21,
			3,
			10,
			21,
			28
		]
	},
	{
		sigma: 1.5,
		r: 4,
		a: [
			0,
			0,
			0,
			1,
			1,
			0,
			1,
			2,
			4,
			5,
			0,
			2,
			6,
			12,
			14,
			1,
			4,
			12,
			22,
			28,
			1,
			5,
			14,
			28,
			35
		]
	},
	{
		sigma: 1.6,
		r: 4,
		a: [
			0,
			0,
			0,
			1,
			1,
			0,
			1,
			2,
			3,
			4,
			0,
			2,
			5,
			9,
			10,
			1,
			3,
			9,
			15,
			19,
			1,
			4,
			10,
			19,
			23
		]
	},
	{
		sigma: 1.7,
		r: 4,
		a: [
			0,
			0,
			1,
			1,
			1,
			0,
			1,
			2,
			3,
			4,
			1,
			2,
			5,
			8,
			9,
			1,
			3,
			8,
			13,
			16,
			1,
			4,
			9,
			16,
			19
		]
	},
	{
		sigma: 1.8,
		r: 4,
		a: [
			0,
			0,
			1,
			2,
			2,
			0,
			1,
			3,
			5,
			5,
			1,
			3,
			6,
			10,
			12,
			2,
			5,
			10,
			16,
			19,
			2,
			5,
			12,
			19,
			22
		]
	},
	{
		sigma: 1.9,
		r: 4,
		a: [
			0,
			0,
			1,
			2,
			2,
			0,
			1,
			3,
			4,
			5,
			1,
			3,
			5,
			8,
			9,
			2,
			4,
			8,
			12,
			14,
			2,
			5,
			9,
			14,
			16
		]
	},
	{
		sigma: 2,
		r: 5,
		a: [
			0,
			0,
			0,
			1,
			1,
			1,
			0,
			0,
			1,
			2,
			3,
			3,
			0,
			1,
			2,
			4,
			7,
			7,
			1,
			2,
			4,
			8,
			12,
			14,
			1,
			3,
			7,
			12,
			18,
			20,
			1,
			3,
			7,
			14,
			20,
			23
		]
	},
	{
		sigma: 2.1,
		r: 5,
		a: [
			0,
			0,
			0,
			1,
			1,
			1,
			0,
			0,
			1,
			2,
			3,
			3,
			0,
			1,
			2,
			4,
			6,
			7,
			1,
			2,
			4,
			8,
			11,
			12,
			1,
			3,
			6,
			11,
			15,
			17,
			1,
			3,
			7,
			12,
			17,
			19
		]
	},
	{
		sigma: 2.2,
		r: 5,
		a: [
			0,
			0,
			0,
			1,
			1,
			2,
			0,
			1,
			2,
			3,
			3,
			4,
			1,
			2,
			3,
			5,
			7,
			8,
			1,
			3,
			5,
			9,
			12,
			13,
			1,
			3,
			7,
			12,
			16,
			18,
			2,
			4,
			8,
			13,
			18,
			20
		]
	},
	{
		sigma: 2.3,
		r: 5,
		a: [
			0,
			0,
			1,
			1,
			1,
			1,
			0,
			1,
			1,
			2,
			3,
			3,
			1,
			1,
			3,
			5,
			6,
			7,
			1,
			2,
			5,
			7,
			10,
			11,
			1,
			3,
			6,
			10,
			13,
			14,
			1,
			3,
			7,
			11,
			14,
			16
		]
	},
	{
		sigma: 2.4,
		r: 5,
		a: [
			0,
			0,
			1,
			1,
			1,
			1,
			0,
			1,
			1,
			2,
			3,
			3,
			1,
			1,
			3,
			4,
			5,
			6,
			1,
			2,
			4,
			6,
			8,
			9,
			1,
			3,
			5,
			8,
			10,
			11,
			1,
			3,
			6,
			9,
			11,
			12
		]
	},
	{
		sigma: 2.5,
		r: 5,
		a: [
			0,
			0,
			1,
			1,
			1,
			1,
			0,
			1,
			1,
			2,
			3,
			3,
			1,
			1,
			2,
			4,
			5,
			5,
			1,
			2,
			4,
			5,
			7,
			7,
			1,
			3,
			5,
			7,
			9,
			9,
			1,
			3,
			5,
			7,
			9,
			10
		]
	}
];
function u(e) {
	if (e < .45) return -1;
	let t = 0;
	for (; t < l.length - 1 && e >= .55 + .1 * t;) t++;
	return t;
}
function d(e) {
	let t = u(e);
	return t < 0 ? 0 : Math.ceil((2 * l[t].r + 1) / 3);
}
var f = 1024;
function ee(e) {
	return !(!e.on || e.amount < 1 || e.method === "rld" && e.deconvAmount === 0 && e.blurRadius < .25);
}
function te(e, t) {
	return e.blurRadius >= .25 ? c(s(e.blurRadius * t, "standard")) : 1;
}
function ne(e, t) {
	let n = e.deconvRadius * t;
	return n < .25 ? 0 : c(s(n, e.deconvDamping > 0 ? "standard" : "div")) + c(s(n, "mult"));
}
function re(e, t = 1) {
	let n = e.method === "usm", r = n && e.edgesOnly ? d(e.edgesRadius * t) : 0, i = n ? c(s(e.radius * t, "standard")) : 0, a = +!!n, o = n ? 0 : ne(e, t), l = o > 0 ? Math.round(e.deconvIterations) : 0, u = te(e, t);
	return {
		prep: 1,
		bilateral: r,
		blur: i,
		apply: a,
		iterations: l,
		perIteration: o,
		blend: 3,
		final: u,
		total: 1 + r + i + a + l * o + 3 + u
	};
}
function p(e) {
	return ee(e) ? Math.min(re(e, 1).total, f) : 0;
}
//#endregion
//#region src/params.ts
var m = "usm-rl-sharpening", h = `${m}.sharpen`, g = [
	"on",
	"contrast",
	"blurRadius",
	"method",
	"radius",
	"thresholdBottomLeft",
	"thresholdTopLeft",
	"thresholdTopRight",
	"thresholdBottomRight",
	"amount",
	"edgesOnly",
	"edgesRadius",
	"edgesTolerance",
	"haloControl",
	"haloAmount",
	"deconvRadius",
	"deconvAmount",
	"deconvDamping",
	"deconvIterations"
], _ = "draws", v = {
	on: "Enabled",
	method: "Method",
	contrast: "Contrast threshold",
	blurRadius: "Blur radius",
	radius: "Radius",
	amount: "Amount",
	thresholdBottomLeft: "Fade-in start",
	thresholdTopLeft: "Fade-in end",
	thresholdTopRight: "Fade-out start",
	thresholdBottomRight: "Fade-out end",
	edgesOnly: "Sharpen only edges",
	edgesRadius: "Edge detection radius",
	edgesTolerance: "Edge tolerance",
	haloControl: "Halo control",
	haloAmount: "Halo amount",
	deconvRadius: "Deconvolution radius",
	deconvAmount: "Deconvolution amount",
	deconvDamping: "Deconvolution damping",
	deconvIterations: "Deconvolution iterations"
}, ie = {
	deconvRadius: "Radius",
	deconvAmount: "Amount",
	deconvDamping: "Damping",
	deconvIterations: "Iterations"
}, ae = [
	"on",
	"edgesOnly",
	"haloControl"
], y = (e) => ae.includes(e), oe = /* @__PURE__ */ new Set([
	"amount",
	"thresholdBottomLeft",
	"thresholdTopLeft",
	"thresholdBottomRight",
	"thresholdTopRight",
	"edgesTolerance",
	"haloAmount",
	"deconvAmount",
	"deconvDamping",
	"deconvIterations"
]), b = (e) => `${h}.${e}`, se = (e) => typeof e == "number" && Number.isFinite(e);
function ce(e, n) {
	let { min: r, max: i } = t[e], a = Math.min(Math.max(n, r), i);
	return oe.has(e) ? Math.round(a) : a;
}
function x(t) {
	let n = { ...e };
	for (let e of g) {
		let r = t[b(e)];
		if (y(e) && typeof r == "boolean") n[e] = r;
		else if (se(r)) e === "method" ? n.method = r >= .5 ? "rld" : "usm" : n[e] = y(e) ? r >= .5 : ce(e, r);
		else continue;
	}
	return n;
}
function S(e, t) {
	return t === "method" ? +(e.method === "rld") : (y(t), e[t]);
}
function le(e) {
	let t = {};
	for (let n of g) t[b(n)] = S(e, n);
	return t[b(_)] = p(e), t;
}
function C(e) {
	if (!(b("draws") in e) && !g.some((t) => b(t) in e)) return null;
	let t = p(x(e));
	return e[b("draws")] === t ? null : { [b(_)]: t };
}
var ue = () => le(e), w, T;
function de(e) {
	T = e, w = e.react;
}
//#endregion
//#region src/Panel.tsx
var E = "USM & RL Sharpening", fe = [{
	value: "usm",
	label: "Unsharp mask"
}, {
	value: "rld",
	label: "RL deconvolution"
}], D = [
	"thresholdBottomLeft",
	"thresholdTopLeft",
	"thresholdTopRight",
	"thresholdBottomRight"
];
function pe(e, n, r) {
	let i = D.indexOf(n);
	if (i < 0) return r;
	let a = i > 0 ? e[D[i - 1]] : t[n].min, o = i < D.length - 1 ? e[D[i + 1]] : t[n].max;
	return Math.min(Math.max(r, a), o);
}
function O() {
	let { Slider: n } = T.components, { Section: r, SegmentedControl: i, Stack: a, Toggle: o } = T.ui, s = T.develop.useParamScope(), c = x(s.getParams()), l = (e, t) => {
		let n = {};
		for (let r of t) n[b(r)] = S(e, r);
		n[b(_)] = p(e), s.setParams(n);
	}, u = (r) => {
		let i = t[r], a = ie[r] ?? v[r];
		return /* @__PURE__ */ w.createElement(n, {
			key: r,
			label: a,
			value: c[r],
			min: i.min,
			max: i.max,
			step: i.step,
			defaultValue: e[r],
			onChange: (e) => {
				let t = x(s.getParams()), n = Math.min(Math.max(e, i.min), i.max);
				l({
					...t,
					[r]: pe(t, r, n)
				}, [r]);
			},
			onCommit: () => s.commit(`${E}: ${v[r].toLowerCase()}`)
		});
	}, d = (e) => /* @__PURE__ */ w.createElement(o, {
		checked: c[e],
		label: v[e],
		onChange: (t) => {
			l({
				...x(s.getParams()),
				[e]: t
			}, [e]), s.commit(`${E}: ${v[e].toLowerCase()} ${t ? "on" : "off"}`);
		}
	}), f = c.method === "usm";
	return /* @__PURE__ */ w.createElement(a, {
		gap: 6,
		style: { padding: 8 }
	}, d("on"), u("contrast"), u("blurRadius"), /* @__PURE__ */ w.createElement(i, {
		size: "sm",
		value: c.method,
		options: fe,
		onChange: (e) => {
			l({
				...x(s.getParams()),
				method: e === "rld" ? "rld" : "usm"
			}, ["method"]), s.commit(`${E}: ${v.method.toLowerCase()}`);
		}
	}), f ? /* @__PURE__ */ w.createElement(w.Fragment, null, u("radius"), /* @__PURE__ */ w.createElement(r, { title: "Threshold" }, D.map((e) => u(e))), u("amount"), d("edgesOnly"), c.edgesOnly ? /* @__PURE__ */ w.createElement(w.Fragment, null, u("edgesRadius"), u("edgesTolerance")) : null, d("haloControl"), c.haloControl ? u("haloAmount") : null) : /* @__PURE__ */ w.createElement(w.Fragment, null, u("deconvRadius"), u("deconvAmount"), u("deconvDamping"), u("deconvIterations")));
}
//#endregion
//#region src/glsl.ts
function me(e) {
	let t = e.toPrecision(10);
	if (/e/i.test(t)) {
		let [e, n] = t.split(/e/i);
		return `${e.includes(".") ? e : `${e}.0`}e${Number(n)}`;
	}
	return t.includes(".") ? t.replace(/0+$/, "").replace(/\.$/, ".0") : `${t}.0`;
}
var k = me, A = [
	[
		.4360747,
		.3850649,
		.1430804
	],
	[
		.2225045,
		.7168786,
		.0606169
	],
	[
		.0139322,
		.0971045,
		.7141733
	]
];
function he(e) {
	let [t, n, r] = e, i = t[0] * (n[1] * r[2] - n[2] * r[1]) - t[1] * (n[0] * r[2] - n[2] * r[0]) + t[2] * (n[0] * r[1] - n[1] * r[0]);
	return [
		[
			(n[1] * r[2] - n[2] * r[1]) / i,
			(t[2] * r[1] - t[1] * r[2]) / i,
			(t[1] * n[2] - t[2] * n[1]) / i
		],
		[
			(n[2] * r[0] - n[0] * r[2]) / i,
			(t[0] * r[2] - t[2] * r[0]) / i,
			(t[2] * n[0] - t[0] * n[2]) / i
		],
		[
			(n[0] * r[1] - n[1] * r[0]) / i,
			(t[1] * r[0] - t[0] * r[1]) / i,
			(t[0] * n[1] - t[1] * n[0]) / i
		]
	];
}
var j = (e) => `mat3(${[
	0,
	1,
	2
].flatMap((t) => [
	0,
	1,
	2
].map((n) => k(e[n][t]))).join(", ")})`, M = 24389 / 27, N = 216 / 24389, P = .9642, F = .8249, ge = `
float shCbrt(float v) {
  float r = exp2(log2(v) / 3.0);
  return r - (r * r * r - v) / (3.0 * r * r);
}
float shLuminance(vec3 rgb) {
  float y = dot(vec3(${A[1].map(k).join(", ")}), rgb);
  return y > ${k(N)} ? 1.16 * shCbrt(y) - 0.16 : ${k(M / 100)} * y;
}
`, _e = `
float shLabF(float t) {
  if (t > ${k(N)}) {
    float r = exp2(log2(t) / 3.0);
    return r - (r * r * r - t) / (3.0 * r * r);
  }
  return (${k(M)} * t + 16.0) / 116.0;
}
float shLabFInv(float f) {
  return f > ${k(6 / 29)} ? f * f * f : (116.0 * f - 16.0) / ${k(M)};
}
vec3 shShiftLightness(vec3 rgb, float dL) {
  vec3 xyz = ${j(A)} * rgb / vec3(${k(P)}, 1.0, ${k(F)});
  float shift = dL * ${k(100 / 116)};
  vec3 moved = vec3(shLabFInv(shLabF(xyz.x) + shift), shLabFInv(shLabF(xyz.y) + shift), shLabFInv(shLabF(xyz.z) + shift));
  return ${j(he(A))} * (moved * vec3(${k(P)}, 1.0, ${k(F)}));
}
`, ve = "\nif (draws > 0) {\n  float shDL = stageResult.x;\n  if (shDL != 0.0) c.rgb = shShiftLightness(c.rgb, shDL);\n}\n", I = {
	zero: 0,
	prep: 1,
	bilateral: 2,
	blur: 3,
	apply: 4,
	divide: 5,
	multiply: 6,
	blend: 7,
	final: 8,
	copy: 9
}, L = 0, R = 1, z = 2, B = 3, ye = 4, V = {
	luminance: 0,
	base: 2,
	baseBlurred: 3,
	estimate: 4,
	estimateBlurred: 5,
	ratio: 6,
	blend: 7,
	observed: 8,
	finalBlurred: 9
}, H = {
	none: 0,
	gauss3x3: 1,
	disc5: 2,
	disc7: 3,
	row: 4,
	column: 5
}, U = 18, W = 5, be = {
	r: 2,
	limit: Math.floor(2.52 ** 2)
}, xe = {
	r: 3,
	limit: Math.floor((3 * 1.15) ** 2)
};
function G(e, { r: t, limit: n }, r) {
	let i = Array.from({ length: 2 * t + 1 }, (e, n) => n - t), a = Array.from({ length: t + 1 }, (e, t) => `  float c${t} = exp(${k(t * t)} / temp);`), o = (e) => i.map((t) => e(t).join("\n")).join("\n");
	return `
vec2 ${e}(ivec2 q, float sigma, int what) {
  float temp = -2.0 * sigma * sigma;
${a.join("\n")}
  float sum = 0.0;
  for (int i = -${t}; i <= ${t}; i++) {
    float rf = exp(float(i * i) / temp);
${o((e) => [`    if (i * i + ${e * e} <= ${n}) sum += rf * c${Math.abs(e)};`])}
  }
${r ? "  float quirk = exp(5.0 / temp) / sum;\n" : ""}  vec4 la;
  vec2 lb;
  shLine(what, la, lb);
  ivec2 last = shSize() - 1;
  float own = shRead(shAtIn(q, last), la, lb);
  float acc = 0.0;
  float weights = 0.0;
  for (int i = -${t}; i <= ${t}; i++) {
    float rf = exp(float(i * i) / temp) / sum;
${o((e) => [
		`    if (i * i + ${e * e} <= ${n}) {`,
		`      float w = rf * c${Math.abs(e)};`,
		...r && e === 1 ? ["      if (i == -2) w *= quirk;"] : [],
		"      weights += w;",
		`      acc += w * (shRead(shAtIn(q + ivec2(${e}, i), last), la, lb) - own);`,
		"    }"
	])}
  }
  return vec2(acc, weights);
}`;
}
function Se() {
	let e = (e, t) => `n${e}${t}`, t = [];
	for (let n = 0; n < 5; n++) for (let r = 0; r < 5; r++) t.push(`  float ${e(n, r)} = shBase(shAt(q + ivec2(${r - 2}, ${n - 2})));`);
	let n = [
		0,
		1,
		2
	].map((t) => {
		let n = [
			0,
			1,
			2
		].map((n) => {
			let r = [];
			for (let i = 0; i < 3; i++) for (let a = 0; a < 3; a++) r.push(e(n + i, t + a));
			return [
				`    np = 2.0 * (${r.join(" + ")}) / 27.0 + ${e(n + 1, t + 1)} / 3.0;`,
				"    hi = first ? np : max(hi, np);",
				"    lo = first ? np : min(lo, np);",
				"    first = false;"
			].join("\n");
		});
		return `  if (q.x >= ${4 - t}) {\n${n.join("\n")}\n  }`;
	});
	return `
vec4 shApplyHalo(ivec2 q, vec4 c) {
  ivec2 size = shSize();
  if (q.x < 2 || q.y < 2 || q.x >= size.x - 2 || q.y >= size.y - 2) return vec4(c.xy, 0.0, 0.0);
  float delta = shDelta(-c.w);
${t.join("\n")}
  float hi = 0.0;
  float lo = 0.0;
  float np = 0.0;
  bool first = true;
${n.join("\n")}
  if (q.x < 4) {
    hi = max(hi, 0.0);
    lo = min(lo, 0.0);
  }
  float lab = shL(c);
  hi = max(hi, lab);
  lo = min(lo, lab);
  float scale = (100.0 - haloAmount) * 0.01;
  float moved = lab + delta;
  float change = delta;
  if (moved > hi) change = (hi - lab) + (moved - hi) * scale;
  else if (moved < lo) change = (lo - lab) - (lo - moved) * scale;
  return vec4(c.xy, change, 0.0);
}`;
}
var K = 6, q = 63;
function Ce(e, t, n) {
	let { r, a: i } = l[e];
	if (t > r || n > r) return 0;
	let a = i[(r - t) * (r + 1) + r - n];
	if (!Number.isInteger(a) || a < 0 || a > q) throw Error(`bilateral weight ${a} does not pack`);
	return a;
}
function J(e, t) {
	let n = (n) => [
		0,
		1,
		2
	].reduce((r, i) => r | Ce(e, t, n + i) << K * i, 0);
	return `ivec2(${n(0)}, ${n(3)})`;
}
function we() {
	let e = l.map((e) => e.r);
	return `
int shBilRadius(int t) { return ${e.flatMap((t, n) => n > 0 && t !== e[n - 1] ? [n] : []).map((t) => `t < ${t} ? ${e[t - 1]} : `).join("") + `${e[e.length - 1]}`}; }
ivec2 shBilWeights(int t, int ady) {
${l.map(({ r: e }, t) => `  if (t == ${t}) return ${Array.from({ length: e }, (e, n) => `ady == ${n} ? ${J(t, n)} : `).join("")}${J(t, e)};`).join("\n")}
  return ivec2(0);
}
float shBilWeight(ivec2 row, int adx) {
  int bits = adx < 3 ? row.x : row.y;
  return float((bits >> (${K} * (adx < 3 ? adx : adx - 3))) & ${q});
}`;
}
var Te = `
// Every int below is highp: the programs' ints are mediump, 16 bits on a driver
// that honours it (Mesa), and the packed bilateral weights take 18.
precision highp int;
${ge}
const int SH_K_SKIP = ${L};
const int SH_K_3X3 = ${R};
const int SH_K_5X5 = ${z};
const int SH_K_7X7 = ${B};
const int SH_K_IIR = ${ye};
${we()}

ivec2 shSize() { return ivec2(floor(1.0 / uTexel + 0.5)); }
// The render's size over the source's: radii in source pixels, as
// RawTherapee divides by its preview scale. Never above 1, which the draw
// count is sized for.
float shScale() {
  vec2 size = vec2(shSize());
  float src = max(uSourceSize.x, uSourceSize.y);
  return src > 0.0 ? min(max(size.x, size.y) / src, 1.0) : 1.0;
}
vec4 shAt(ivec2 t) { return fetchPrev4(clamp(t, ivec2(0), shSize() - 1)); }

int shKernel(float sigma, int mode) {
  if (sigma < ${k(n)}) return SH_K_SKIP;
  if (sigma < ${k(r)}) return SH_K_3X3;
  if (mode != 0 && sigma <= ${k(i)}) return SH_K_5X5;
  if (mode != 0 && sigma <= ${k(a)}) return SH_K_7X7;
  return SH_K_IIR;
}
int shKernelDraws(int k) { return k == SH_K_IIR ? 2 : 1; }
int shBilateralTable(float sigma) {
  if (sigma < 0.45) return -1;
  int k = 0;
  for (int i = 0; i < ${l.length - 1}; i++) {
    if (sigma >= 0.55 + 0.1 * float(i)) k = i + 1;
  }
  return k;
}
int shBilateralDraws(float sigma) {
  int t = shBilateralTable(sigma);
  return t < 0 ? 0 : (2 * shBilRadius(t) + 3) / 3;
}
bool shUsm() { return method < 0.5; }
float shDeconvSigma() { return deconvRadius * shScale(); }
bool shDamped() { return deconvDamping > 0.0; }

// Which step this draw runs (STEP in glsl.ts), its index within the step, and
// the schedule's draw count.
void shSchedule(out int kind, out int sub, out int total) {
  ivec2 size = shSize();
  float s = shScale();
  bool usm = shUsm();
  int bil = usm && edgesOnly ? shBilateralDraws(edgesRadius * s) : 0;
  int blur = usm ? shKernelDraws(shKernel(radius * s, 0)) : 0;
  int apply = usm ? 1 : 0;
  float sd = shDeconvSigma();
  int nA = shKernelDraws(shKernel(sd, shDamped() ? 0 : 2));
  int nB = shKernelDraws(shKernel(sd, 1));
  int per = usm || sd < ${k(n)} ? 0 : nA + nB;
  int fin = blurRadius >= ${k(o)} ? shKernelDraws(shKernel(blurRadius * s, 0)) : 1;
  int fixedDraws = 1 + bil + blur + apply + 3 + fin;
  int iters = per > 0 ? min(int(deconvIterations + 0.5), max(uPassCount - fixedDraws, 0) / per) : 0;
  total = fixedDraws + iters * per;
  sub = 0;
  int i = uPassIndex;
  if (size.x < 8 || size.y < 8 || total > uPassCount) {
    kind = i == 0 ? ${I.zero} : ${I.copy};
    total = 1;
    return;
  }
  if (i == 0) { kind = ${I.prep}; return; }
  i -= 1;
  if (i < bil) { kind = ${I.bilateral}; sub = i; return; }
  i -= bil;
  if (i < blur) { kind = ${I.blur}; sub = i; return; }
  i -= blur;
  if (i < apply) { kind = ${I.apply}; return; }
  i -= apply;
  if (i < iters * per) {
    int k = i - (i / per) * per;
    kind = k < nA ? ${I.divide} : ${I.multiply};
    sub = k < nA ? k : k - nA;
    return;
  }
  i -= iters * per;
  if (i < 3) { kind = ${I.blend}; sub = i; return; }
  i -= 3;
  if (i < fin) { kind = ${I.final}; sub = i; return; }
  kind = ${I.copy};
}

// Every draw of the schedule writes the whole frame; of the copies past it,
// only the first changes anything.
ivec4 shRegion() {
  int kind, sub, total;
  shSchedule(kind, sub, total);
  if (kind == ${I.copy} && uPassIndex > total) return ivec4(0);
  return ivec4(0, 0, shSize());
}

float shL(vec4 t) { return t.x + t.y; }
float shBase(vec4 t) { return t.x + t.y + t.z; }
// The blend mask as w keeps it (shWithBlend), and 1 less it.
float shBlend(float w) { return w > 0.0 ? w : 1.0 + w; }
float shBlendRest(float w) { return w > 0.0 ? 1.0 - w : -w; }
float shObserved(vec4 t) { return max(t.x + t.y, 0.0); }

// What a blur reads from a texel (LINE), as weights of x + y, max(x + y, 0),
// z and w, and of the blend mask's 1 at or below 0 and y + max(x, 0): set
// once a draw, so every tap is the same straight-line code.
void shLine(int what, out vec4 a, out vec2 b) {
  a = vec4(0.0);
  b = vec2(0.0);
  if (what == ${V.luminance}) a = vec4(1.0, 0.0, 0.0, 0.0);
  else if (what == ${V.base}) a = vec4(1.0, 0.0, 1.0, 0.0);
  else if (what == ${V.baseBlurred}) a = vec4(1.0, 0.0, 1.0, 1.0);
  else if (what == ${V.estimate}) a = vec4(0.0, 1.0, 1.0, 0.0);
  else if (what == ${V.estimateBlurred}) a = vec4(0.0, 1.0, 1.0, 1.0);
  else if (what == ${V.ratio}) a = vec4(0.0, 0.0, 0.0, 1.0);
  else if (what == ${V.blend}) { a = vec4(0.0, 0.0, 0.0, 1.0); b = vec2(1.0, 0.0); }
  else if (what == ${V.observed}) a = vec4(0.0, 1.0, 0.0, 0.0);
  else if (shUsm()) a = vec4(1.0, 0.0, 0.0, 0.0);
  else b = vec2(0.0, 1.0);
}
float shRead(vec4 t, vec4 a, vec2 b) {
  float s = t.x + t.y;
  return dot(vec4(s, max(s, 0.0), t.z, t.w), a) + dot(vec2(step(t.w, 0.0), t.y + max(t.x, 0.0)), b);
}
// A texel of the previous draw, clamped to the frame's last texel.
vec4 shAtIn(ivec2 t, ivec2 last) { return fetchPrev4(clamp(t, ivec2(0), last)); }

// Young-van Vliet's coefficients (calculateYvVFactors), with the SSE build's
// far-edge factor rho over the scalar build's.
void shYvV(float sigma, out float B, out float b1, out float b2, out float b3, out float rho) {
  float q = sigma < 2.5 ? 3.97156 - 4.14554 * sqrt(1.0 - 0.26891 * sigma) : 0.98711 * sigma - 0.9633;
  float b0 = 1.57825 + 2.44413 * q + 1.4281 * q * q + 0.422205 * q * q * q;
  b1 = (2.44413 * q + 2.85619 * q * q + 1.26661 * q * q * q) / b0;
  b2 = (-1.4281 * q * q - 1.26661 * q * q * q) / b0;
  b3 = 0.422205 * q * q * q / b0;
  B = 1.0 - (b1 + b2 + b3);
  float k = 1.0 + b2 + (b1 - b3) * b3;
  rho = k * k / (1.0 - b1 - b2 - b3);
}

// The recursion of a line along e (length n, this texel at j) applied to
// value \`what\`, less this texel's value. The taps are the impulse response's
// autocorrelation, h0 = 1 and the Yule-Walker ratios, rolled as h(k), h(k + 1)
// and h(k + 2).
float shRecursion(ivec2 q, ivec2 e, int n, int j, float sigma, int what) {
  float B, b1, b2, b3, rho;
  shYvV(sigma, B, b1, b2, b3, rho);
  int reach = min(int(ceil(${k(6)} * sigma)), ${U});
  float r1 = (b1 + b2 * b3) / (1.0 - b2 - b3 * (b1 + b3));
  float r2 = b2 + (b1 + b3) * r1;
  float r3 = b3 + b2 * r1 + b1 * r2;
  vec4 la;
  vec2 lb;
  shLine(what, la, lb);
  ivec2 last = shSize() - 1;
  float own = shRead(shAtIn(q, last), la, lb);
  float h0 = r1;
  float h1 = r2;
  float h2 = r3;
  float norm = 1.0;
  float acc = 0.0;
  for (int k = 1; k <= ${U}; k++) {
    if (k > reach) break;
    norm += 2.0 * h0;
    acc += h0 * ((shRead(shAtIn(q - e * k, last), la, lb) - own) + (shRead(shAtIn(q + e * k, last), la, lb) - own));
    float next = b1 * h2 + b2 * h1 + b3 * h0;
    h0 = h1;
    h1 = h2;
    h2 = next;
  }
  acc /= norm;
  int d = n - 1 - j;
  if (d <= reach) {
    // The constant extension past the far edge: the line's taps at or beyond
    // offset d read the edge, the rest the d - s before it, s = 1 to reach,
    // each the tap k = -(s + m) of the sum centred m past the edge.
    float edge = shRead(shAtIn(q + e * d, last), la, lb) - own;
    float y0 = 0.0;
    float y1 = 0.0;
    float y2 = 0.0;
    float tail0 = 0.0;
    float tail1 = 0.0;
    float tail2 = 0.0;
    h0 = r1;
    h1 = r2;
    h2 = r3;
    for (int s = 1; s <= ${U}; s++) {
      if (s > reach) break;
      float v = shRead(shAtIn(q + e * (d - s), last), la, lb) - own;
      y0 += h0 * v;
      tail0 += h0;
      if (s + 1 <= reach) y1 += h1 * v;
      if (s >= 2) tail1 += h0;
      if (s + 2 <= reach) y2 += h2 * v;
      if (s >= 3) tail2 += h0;
      float next = b1 * h2 + b2 * h1 + b3 * h0;
      h0 = h1;
      h1 = h2;
      h2 = next;
    }
    float c0 = (rho - 1.0) * ((y0 + edge * (norm - tail0)) / norm - edge);
    float c1 = (rho - 1.0) * ((y1 + edge * (norm - tail1)) / norm - edge);
    float c2 = (rho - 1.0) * ((y2 + edge * (norm - tail2)) / norm - edge);
    for (int t = 0; t < ${U}; t++) {
      if (t >= d) break;
      float next = b1 * c0 + b2 * c1 + b3 * c2;
      c2 = c1;
      c1 = c0;
      c0 = next;
    }
    acc += c0;
  }
  return acc;
}
float shRecursionH(ivec2 q, float sigma, int what) { return shRecursion(q, ivec2(1, 0), shSize().x, q.x, sigma, what); }
float shRecursionV(ivec2 q, float sigma, int what) { return shRecursion(q, ivec2(0, 1), shSize().y, q.y, sigma, what); }

// gauss3x3 (src != dst): the corners copied, the outer rows and columns a
// 3-tap blur along them; the result less the texel's value.
float shGauss3x3(ivec2 q, float sigma, int what) {
  ivec2 size = shSize();
  vec4 la;
  vec2 lb;
  shLine(what, la, lb);
  ivec2 last = shSize() - 1;
  float own = shRead(shAtIn(q, last), la, lb);
  bool rowEdge = q.y == 0 || q.y == size.y - 1;
  bool colEdge = q.x == 0 || q.x == size.x - 1;
  if (rowEdge && colEdge) return 0.0;
  if (rowEdge || colEdge) {
    float b = exp(-1.0 / (2.0 * sigma * sigma));
    float b1 = b / (2.0 * b + 1.0);
    ivec2 e = rowEdge ? ivec2(1, 0) : ivec2(0, 1);
    return b1 * (shRead(shAtIn(q - e, last), la, lb) - own + shRead(shAtIn(q + e, last), la, lb) - own);
  }
  float c1 = exp(-0.5 / (sigma * sigma));
  float c2 = exp(-1.0 / (sigma * sigma));
  float sum = 1.0 + 4.0 * (c1 + c2);
  float acc = c2 * (shRead(shAtIn(q + ivec2(-1, -1), last), la, lb) - own) + c1 * (shRead(shAtIn(q + ivec2(0, -1), last), la, lb) - own)
    + c2 * (shRead(shAtIn(q + ivec2(1, -1), last), la, lb) - own) + c1 * (shRead(shAtIn(q + ivec2(-1, 0), last), la, lb) - own)
    + c1 * (shRead(shAtIn(q + ivec2(1, 0), last), la, lb) - own) + c2 * (shRead(shAtIn(q + ivec2(-1, 1), last), la, lb) - own)
    + c1 * (shRead(shAtIn(q + ivec2(0, 1), last), la, lb) - own) + c2 * (shRead(shAtIn(q + ivec2(1, 1), last), la, lb) - own);
  return acc / sum;
}
${G("shDisc5", be, !1)}
${G("shDisc7", xe, !0)}

// Threshold<int>::multiply, double, not starting at one: x in L units.
float shThreshold(float x, float yMax) {
  if (x == thresholdBottomRight && thresholdBottomRight == thresholdTopRight) return yMax;
  if (x >= thresholdBottomRight) return 0.0;
  if (x > thresholdTopRight) return yMax * (1.0 - (x - thresholdTopRight) / (thresholdBottomRight - thresholdTopRight));
  if (x >= thresholdTopLeft) return yMax;
  if (x > thresholdBottomLeft) return yMax * (x - thresholdBottomLeft) / (thresholdTopLeft - thresholdBottomLeft);
  return 0.0;
}
// The unsharp mask's change for base - blur (upperBound 2000 L units).
float shDelta(float diff) {
  return shThreshold(min(abs(diff) * 32768.0, 2000.0), amount * 0.01 * diff);
}

vec4 shPrep(vec4 c) {
  float lum = shLuminance(c.rgb);
  float hi = unpackHalf2x16(packHalf2x16(vec2(lum, 0.0))).x;
  return vec4(hi, lum - hi, 0.0, 0.0);
}

// One draw's three rows of bilateral2.h's window: the weighted differences
// from the centre and the weights, in z and w, and the last draw their
// quotient in z: the base less L. The border keeps L.
vec4 shBilateral(ivec2 q, vec4 c, int chunk) {
  ivec2 size = shSize();
  int t = shBilateralTable(edgesRadius * shScale());
  int r = shBilRadius(t);
  if (q.x < r || q.y < r || q.x >= size.x - r || q.y >= size.y - r) return vec4(c.xy, 0.0, 1.0);
  float centre = shL(c);
  float num = chunk == 0 ? 0.0 : c.z;
  float den = chunk == 0 ? 0.0 : c.w;
  float twoSens2 = 2.0 * edgesTolerance * edgesTolerance;
  for (int k = 0; k < 3; k++) {
    int dy = -r + 3 * chunk + k;
    if (dy > r) break;
    ivec2 weightsRow = shBilWeights(t, abs(dy));
    for (int dx = -${W}; dx <= ${W}; dx++) {
      if (abs(dx) > r) continue;
      float w = shBilWeight(weightsRow, abs(dx));
      if (w == 0.0) continue;
      float d = shL(shAt(q + ivec2(dx, dy))) - centre;
      float e = exp(-(d * 32768.0) * (d * 32768.0) / twoSens2);
      num += w * e * d;
      den += w * e;
    }
  }
  bool last = chunk == shBilateralDraws(edgesRadius * shScale()) - 1;
  return last ? vec4(c.xy, num / den, 0.0) : vec4(c.xy, num, den);
}

// The unsharp mask's blur of its base (L, or the bilateral's result): z the
// base less L, w the blur less the base.
float shBlurSigma() { return radius * shScale(); }
vec4 shBlurSkip(vec4 c) { return vec4(c.xyz, 0.0); }
// The 3x3, or the recursion's horizontal half.
vec4 shBlurFirst(vec4 c, float f) { return vec4(c.xyz, f); }
vec4 shBlurV(vec4 c, float f) { return vec4(c.xyz, c.w + f); }

// The unsharp mask's change, unblended, in z: the threshold's share of
// amount times base - blur.
vec4 shApplyPlain(vec4 c) { return vec4(c.xy, shDelta(-c.w), 0.0); }
${Se()}

// dcdamping on the blurred estimate I against the observed O: the ratio less 1.
float shDamp(float I, float O) {
  if (O <= 0.0 || I <= 0.0) return -1.0;
  float d = deconvDamping / 5.0;
  float U = (O * log(I / O) - I + O) * (-2.0 * 32768.0 / (d * d));
  U = min(U, 1.0);
  U = U * U * U * U * (5.0 - U * 4.0);
  return (O - I) / I * U;
}
// GAUSS_DIV's O over the blurred estimate, less 1; RawTherapee's guard is 1 L unit.
float shDivide(float O, float blurred) {
  return blurred > 0.0 ? (O - blurred) / blurred : O * 32768.0 - 1.0;
}
float shRatio(vec4 c, float blurred) {
  float O = shObserved(c);
  return shDamped() ? shDamp(blurred, O) : shDivide(O, blurred);
}
bool shInside(ivec2 q, int r) {
  ivec2 size = shSize();
  return q.x >= r && q.y >= r && q.x < size.x - r && q.y < size.y - r;
}
// gauss5x5div / gauss7x7div's interior, divided by at least 0.00001 L units.
vec4 shDivideDisc(vec4 c, vec2 disc) {
  float O = shObserved(c);
  float val = (O + c.z) * disc.y + disc.x;
  float guard = ${k(1e-5 / 32768)};
  return vec4(c.xyz, val >= guard ? (O - val) / val : O / guard - 1.0);
}

// The deconvolution's first blur: the estimate's, divided into the observed
// L (or damped against it): the ratio less 1 in w. The 5x5 and 7x7 borders'
// ratio is 1.
vec4 shDivide3x3(vec4 c, float f) { return vec4(c.xyz, shRatio(c, shObserved(c) + c.z + f)); }
vec4 shDivideDiscAt(ivec2 q, vec4 c, vec2 disc, int border) { return shInside(q, border) ? shDivideDisc(c, disc) : vec4(c.xyz, 0.0); }
vec4 shDivideH(vec4 c, float f) { return vec4(c.xyz, f); }
vec4 shDivideV(vec4 c, float f) { return vec4(c.xyz, shRatio(c, shObserved(c) + c.z + c.w + f)); }

// The second blur: the ratio's, multiplying the estimate: z the new estimate
// less L. gauss5x5mult and gauss7x7mult leave the border.
vec4 shMultiply(vec4 c, float gain) { return vec4(c.xy, c.z + (shObserved(c) + c.z) * gain, 0.0); }
// The 3x3, or the recursion's vertical half.
vec4 shMultiplyLast(vec4 c, float f) { return shMultiply(c, c.w + f); }
vec4 shMultiplyDisc(ivec2 q, vec4 c, vec2 disc, int border) {
  return shInside(q, border) ? shMultiply(c, c.w * disc.y + disc.x + (disc.y - 1.0)) : vec4(c.xyz, 0.0);
}
vec4 shMultiplyH(vec4 c, float f) { return vec4(c.xyz, c.w + f); }

// buildBlendMask in w: the sigmoid of the 4-tap gradient over the interior,
// the 2 px border taking its nearest interior value, then the sigma 2 blur.
// Contrast 0 is 1 everywhere. The mask is kept as itself up to 0.5 and as
// itself less 1 above, so a half float holds 1 - blend as finely as blend:
// a fully sharpened pixel takes the deconvolution's estimate whole, which can
// be 0. The sigmoid is never below 0.00097, so 0 can only mean 1.
vec4 shWithBlend(vec4 c, float b) { return vec4(c.xyz, b > 0.5 ? b - 1.0 : b); }
vec4 shBlendGradient(ivec2 q, vec4 c) {
  if (contrast == 0.0) return shWithBlend(c, 1.0);
  ivec2 p = clamp(q, ivec2(2), shSize() - 3);
  float gx1 = shL(shAt(p + ivec2(1, 0))) - shL(shAt(p - ivec2(1, 0)));
  float gy1 = shL(shAt(p + ivec2(0, 1))) - shL(shAt(p - ivec2(0, 1)));
  float gx2 = shL(shAt(p + ivec2(2, 0))) - shL(shAt(p - ivec2(2, 0)));
  float gy2 = shL(shAt(p + ivec2(0, 2))) - shL(shAt(p - ivec2(0, 2)));
  float g = sqrt(gx1 * gx1 + gy1 * gy1 + gx2 * gx2 + gy2 * gy2) * ${k(2048 / 327.68)};
  float x = -16.0 + (16.0 / (contrast / 100.0)) * g;
  return shWithBlend(c, 0.5 * (1.0 + x / sqrt(1.0 + x * x)));
}
vec4 shBlendBlur(vec4 c, float f) { return contrast == 0.0 ? c : shWithBlend(c, shBlend(c.w) + f); }

// The result: the change of L, in x. Unsharp mask: L plus the blend times its
// change; deconvolution: the estimate mixed in by the blend times the amount.
// With the blur radius on, either is mixed with the blur by the blend,
// intp(blend, result, intp(blend, L, blur)), all as changes from L: \`toBlur\`
// is the blur less its source (L, or the observed L), and \`lum\` only places
// the clamps at 0.
bool shBlurRadiusOn() { return blurRadius >= ${k(o)}; }
float shFinalSigma() { return blurRadius * shScale(); }
int shFinalLine() { return shUsm() ? ${V.luminance} : ${V.observed}; }
// max(v + d, 0) - v.
float shAbove(float v, float d) { return v + d >= 0.0 ? d : -v; }
vec4 shResult(vec4 c, float lum, float toBlur, bool mixBlur) {
  float b = shBlend(c.w);
  float rest = shBlendRest(c.w);
  bool usm = shUsm();
  float O = max(lum, 0.0);
  float base = usm ? lum : O;
  // The result less its base (L for the unsharp mask, O for deconvolution).
  float sharp = usm ? b * c.z : b * (deconvAmount / 100.0) * shAbove(O, c.z);
  float change = sharp;
  if (mixBlur) {
    float mixed = rest * shAbove(base, toBlur);
    change = sharp + rest * (shAbove(base, mixed) - sharp);
  }
  return vec4(change + base - lum, 0.0, 0.0, 1.0);
}
// Without the blur radius, or with it below GAUSS_SKIP, where the blur is its source.
vec4 shFinalPlain(vec4 c) { return shResult(c, shL(c), 0.0, shBlurRadiusOn()); }
vec4 shFinal3x3(vec4 c, float f) { return shResult(c, shL(c), f, true); }
// The recursion's horizontal half less its source, in y: y's remainder of L
// is spent here, and the vertical half reads its taps over the source's half.
vec4 shFinalH(vec4 c, float f) { return vec4(c.x, f, c.zw); }
vec4 shFinalV(vec4 c, float f) { return shResult(c, c.x, c.y + f, true); }

// The kernel this draw's step blurs with.
int shStepKernel(int kind) {
  float s = shScale();
  if (kind == ${I.blur}) return shKernel(radius * s, 0);
  if (kind == ${I.divide}) return shKernel(shDeconvSigma(), shDamped() ? 0 : 2);
  if (kind == ${I.multiply}) return shKernel(shDeconvSigma(), 1);
  if (kind == ${I.final}) return shBlurRadiusOn() ? shKernel(blurRadius * s, 0) : SH_K_SKIP;
  return SH_K_SKIP;
}

// The one blur this draw's step reads (FILTER), its sigma, and the value it
// filters (LINE). Each blur has one call site in the pass, so the compiler
// inlines each once.
void shFilterOf(int kind, int kernel, int sub, out int blurKind, out float sigma, out int what) {
  blurKind = ${H.none};
  sigma = 1.0;
  what = ${V.luminance};
  bool iir = kernel == SH_K_IIR;
  int halfOf = sub == 1 ? ${H.column} : ${H.row};
  if (kind == ${I.blur}) {
    sigma = shBlurSigma();
    blurKind = kernel == SH_K_3X3 ? ${H.gauss3x3} : iir ? halfOf : ${H.none};
    what = iir && sub == 1 ? ${V.baseBlurred} : ${V.base};
  } else if (kind == ${I.divide} || kind == ${I.multiply}) {
    sigma = shDeconvSigma();
    blurKind = kernel == SH_K_3X3 ? ${H.gauss3x3} : kernel == SH_K_5X5 ? ${H.disc5} : kernel == SH_K_7X7 ? ${H.disc7} : halfOf;
    what = kind == ${I.multiply} ? ${V.ratio} : iir && sub == 1 ? ${V.estimateBlurred} : ${V.estimate};
  } else if (kind == ${I.blend} && sub > 0 && contrast != 0.0) {
    sigma = 2.0;
    blurKind = sub == 2 ? ${H.column} : ${H.row};
    what = ${V.blend};
  } else if (kind == ${I.final}) {
    sigma = shFinalSigma();
    blurKind = kernel == SH_K_3X3 ? ${H.gauss3x3} : iir ? halfOf : ${H.none};
    what = iir && sub == 1 ? ${V.finalBlurred} : shFinalLine();
  }
}
`, Ee = "return shRegion();", De = {
	gauss3x3: "f = shGauss3x3(q, sigma, what);",
	row: "f = shRecursionH(q, sigma, what);",
	column: "f = shRecursionV(q, sigma, what);",
	disc5: "d = shDisc5(q, sigma, what);",
	disc7: "d = shDisc7(q, sigma, what);"
}, Y = {
	prep: "c = shPrep(c);",
	bilateral: "c = shBilateral(q, c, sub);",
	blurSkip: "c = shBlurSkip(c);",
	blurFirst: "c = shBlurFirst(c, f);",
	blurV: "c = shBlurV(c, f);",
	applyPlain: "c = shApplyPlain(c);",
	applyHalo: "c = shApplyHalo(q, c);",
	divide3x3: "c = shDivide3x3(c, f);",
	divide5x5: "c = shDivideDiscAt(q, c, d, 2);",
	divide7x7: "c = shDivideDiscAt(q, c, d, 3);",
	divideH: "c = shDivideH(c, f);",
	divideV: "c = shDivideV(c, f);",
	multiplyLast: "c = shMultiplyLast(c, f);",
	multiply5x5: "c = shMultiplyDisc(q, c, d, 2);",
	multiply7x7: "c = shMultiplyDisc(q, c, d, 3);",
	multiplyH: "c = shMultiplyH(c, f);",
	blendGradient: "c = shBlendGradient(q, c);",
	blendBlur: "c = shBlendBlur(c, f);",
	finalPlain: "c = shFinalPlain(c);",
	final3x3: "c = shFinal3x3(c, f);",
	finalH: "c = shFinalH(c, f);",
	finalV: "c = shFinalV(c, f);"
}, X = De, Oe = `
ivec2 q = ivec2(gl_FragCoord.xy);
int kind, sub, total;
shSchedule(kind, sub, total);
int kernel = shStepKernel(kind);
bool second = sub == 1;
int blurKind;
float sigma;
int what;
shFilterOf(kind, kernel, sub, blurKind, sigma, what);
float f = 0.0;
vec2 d = vec2(0.0);
if (blurKind == ${H.gauss3x3}) ${X.gauss3x3}
else if (blurKind == ${H.row}) ${X.row}
else if (blurKind == ${H.column}) ${X.column}
else if (blurKind == ${H.disc5}) ${X.disc5}
else if (blurKind == ${H.disc7}) ${X.disc7}
if (kind == ${I.zero}) {
  c = vec4(0.0);
} else if (kind == ${I.prep}) {
  ${Y.prep}
} else if (kind == ${I.bilateral}) {
  ${Y.bilateral}
} else if (kind == ${I.blur}) {
  if (kernel == ${L}) ${Y.blurSkip}
  else if (!second) ${Y.blurFirst}
  else ${Y.blurV}
} else if (kind == ${I.apply}) {
  if (haloControl) ${Y.applyHalo}
  else ${Y.applyPlain}
} else if (kind == ${I.divide}) {
  if (kernel == ${R}) ${Y.divide3x3}
  else if (kernel == ${z}) ${Y.divide5x5}
  else if (kernel == ${B}) ${Y.divide7x7}
  else if (!second) ${Y.divideH}
  else ${Y.divideV}
} else if (kind == ${I.multiply}) {
  if (kernel == ${z}) ${Y.multiply5x5}
  else if (kernel == ${B}) ${Y.multiply7x7}
  else if (kernel == ${R} || second) ${Y.multiplyLast}
  else ${Y.multiplyH}
} else if (kind == ${I.blend}) {
  if (sub == 0) ${Y.blendGradient}
  else ${Y.blendBlur}
} else if (kind == ${I.final}) {
  if (kernel == ${L}) ${Y.finalPlain}
  else if (kernel == ${R}) ${Y.final3x3}
  else if (!second) ${Y.finalH}
  else ${Y.finalV}
}
`, ke = (e) => e in t, Z = (n) => {
	let r = {
		key: n,
		default: S(e, n),
		label: v[n]
	};
	return y(n) ? {
		...r,
		glslType: "bool"
	} : {
		...r,
		glslType: "float",
		range: ke(n) ? { ...t[n] } : {
			min: 0,
			max: 1,
			step: 1
		}
	};
}, Ae = {
	key: _,
	glslType: "int",
	default: 0
};
function je() {
	return {
		id: h,
		name: "USM & RL Sharpening",
		phase: "display-adjust",
		priority: 140,
		reads: "current",
		space: {
			encoding: "linear",
			primaries: "rec709"
		},
		glsl: ve,
		helpers: _e,
		uniforms: [...g.map(Z), Ae],
		passes: [{
			channels: 4,
			glsl: Oe,
			helpers: Te,
			region: Ee,
			iterations: {
				key: _,
				max: f
			},
			uniforms: g.map(Z)
		}],
		dormantWhen: { [_]: 0 },
		mask: { maskable: !0 }
	};
}
//#endregion
//#region src/index.tsx
var Q = `${m}.panel`, $ = null;
function Me() {
	let e = T.stores.useDevelopStore.getState();
	e.setDynParams(ue()), e.commitEdit(`${E} reset`);
}
function Ne(e) {
	de(e), e.registerProcessingStage(je()), e.registerPanel({
		id: Q,
		title: E,
		component: O,
		defaultDock: {
			module: "develop",
			direction: "right",
			width: 280
		},
		modules: ["develop"],
		onReset: Me,
		mask: {
			component: O,
			owns: [...g.map(b), b(_)]
		}
	}), $?.(), $ = e.stores.useDevelopStore.subscribe((e, t) => {
		if (e.params.masks !== t.params.masks) for (let n of e.params.masks) {
			if (t.params.masks.some((e) => e.id === n.id && e.bag === n.bag)) continue;
			let r = n.bag ? C(n.bag) : null;
			r && e.updateMaskBag(n.id, r);
		}
		if (e.paramBag === t.paramBag) return;
		let n = C(e.paramBag);
		n && e.setDynParams(n);
	});
}
function Pe() {
	$?.(), $ = null;
}
//#endregion
export { Q as PANEL_ID, Ne as activate, Pe as deactivate };

//# sourceMappingURL=index.js.map