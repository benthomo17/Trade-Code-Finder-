// trades.js
// Curated keyword + synonym dictionaries for each trade.
// Used to power trade filters and to expand plain-language searches
// into related code terminology (fully offline, no network needed).

const TRADES = {
  electrical: {
    label: "Electrical",
    color: "#f5a623",
    icon: "⚡", // lightning
    // Common code books this trade lives in (shown as hints)
    books: ["NEC / NFPA 70", "IRC Ch. 34-43", "Local electrical code"],
    // Every keyword below marks a page as "electrical relevant".
    keywords: [
      "electrical", "electric", "voltage", "volt", "amperage", "ampacity",
      "amp", "circuit", "breaker", "gfci", "ground fault", "afci", "arc fault",
      "conductor", "wire", "wiring", "gauge", "awg", "conduit", "raceway",
      "romex", "nm cable", "grounding", "grounded", "bonding", "neutral",
      "receptacle", "outlet", "junction box", "panelboard", "panel",
      "service entrance", "load center", "disconnect", "overcurrent",
      "luminaire", "lighting", "switch", "gfi", "nec", "nfpa 70", "kilowatt",
      "transformer", "feeder", "branch circuit", "polarity", "phase",
      "insulation", "temperature rating", "box fill", "derating"
    ],
    // Synonyms: query on the left also matches any terms on the right.
    synonyms: {
      "gfci": ["ground fault", "gfi", "ground-fault circuit interrupter"],
      "afci": ["arc fault", "arc-fault circuit interrupter"],
      "romex": ["nm cable", "nonmetallic cable", "nm-b"],
      "outlet": ["receptacle"],
      "wire size": ["awg", "gauge", "conductor size", "ampacity"],
      "breaker": ["overcurrent", "ocpd", "circuit breaker"],
      "panel": ["panelboard", "load center", "service panel"]
    }
  },

  plumbing: {
    label: "Plumbing",
    color: "#4a90e2",
    icon: "🚰", // water tap
    books: ["IPC / UPC", "IRC Ch. 25-33", "Local plumbing code"],
    keywords: [
      "plumbing", "pipe", "piping", "drain", "waste", "vent", "dwv",
      "trap", "p-trap", "s-trap", "cleanout", "fixture", "fixture unit",
      "dfu", "wsfu", "water supply", "water heater", "supply line",
      "backflow", "back-siphonage", "cross connection", "potable",
      "sanitary", "sewer", "sewage", "sump", "slope", "grade", "fall",
      "pex", "cpvc", "abs", "pvc", "copper", "cast iron", "no-hub",
      "wye", "sanitary tee", "combination", "stack", "riser",
      "flood level rim", "air gap", "vacuum breaker", "relief valve",
      "expansion tank", "gpm", "psi", "ipc", "upc", "gas piping",
      "condensate", "faucet", "lavatory", "closet", "toilet", "shower pan"
    ],
    synonyms: {
      "vent": ["dwv", "air admittance", "aav"],
      "trap": ["p-trap", "s-trap", "trap arm"],
      "slope": ["grade", "fall", "pitch"],
      "backflow": ["back-siphonage", "cross connection", "vacuum breaker"],
      "cleanout": ["co", "access"],
      "toilet": ["water closet", "closet"],
      "pipe size": ["fixture unit", "dfu", "wsfu"]
    }
  },

  hvac: {
    label: "HVAC",
    color: "#e0533d",
    icon: "❄", // snowflake
    books: ["IMC / UMC", "IFGC", "IRC Ch. 12-24", "Manual J / D"],
    keywords: [
      "hvac", "heating", "cooling", "ventilation", "air conditioning",
      "furnace", "boiler", "heat pump", "condenser", "evaporator",
      "duct", "ductwork", "plenum", "register", "grille", "diffuser",
      "return air", "supply air", "makeup air", "combustion air",
      "flue", "vent connector", "chimney", "draft", "damper", "cfm",
      "btu", "tonnage", "seer", "afue", "refrigerant", "line set",
      "condensate", "thermostat", "zoning", "manual j", "manual d",
      "manual s", "static pressure", "air handler", "ahu", "rtu",
      "exhaust", "bath fan", "range hood", "dryer duct", "imc", "ifgc",
      "gas appliance", "clearance to combustibles", "b-vent", "direct vent"
    ],
    synonyms: {
      "duct size": ["cfm", "static pressure", "manual d"],
      "load": ["manual j", "btu", "tonnage", "heat loss", "heat gain"],
      "flue": ["vent connector", "chimney", "b-vent", "draft"],
      "combustion air": ["makeup air", "fresh air"],
      "exhaust": ["bath fan", "range hood", "ventilation"]
    }
  },

  carpentry: {
    label: "Carpentry / Framing",
    color: "#8b6d4f",
    icon: "🔨", // hammer
    books: ["IRC Ch. 3-10", "IBC Ch. 23", "Span tables"],
    keywords: [
      "carpentry", "framing", "frame", "stud", "joist", "rafter",
      "truss", "beam", "header", "girder", "sill plate", "top plate",
      "bottom plate", "sole plate", "sheathing", "subfloor", "decking",
      "span", "span table", "spacing", "on center", "o.c.", "notch",
      "notching", "bored hole", "blocking", "bridging", "fire blocking",
      "draft stop", "nailing", "fastener", "nailing schedule", "lumber",
      "dimensional lumber", "engineered lumber", "lvl", "i-joist",
      "glulam", "shear wall", "bracing", "wall bracing", "anchor bolt",
      "hold down", "ledger", "deck", "guard", "guardrail", "handrail",
      "stair", "rise", "run", "tread", "riser", "headroom", "irc",
      "load bearing", "bearing wall", "cripple", "jack stud", "king stud"
    ],
    synonyms: {
      "joist span": ["span table", "span", "spacing", "o.c."],
      "header": ["girder", "beam", "lintel"],
      "stair": ["rise", "run", "tread", "riser", "headroom"],
      "notch": ["notching", "bored hole", "drilling"],
      "fastener": ["nailing schedule", "nail", "nailing"],
      "railing": ["guard", "guardrail", "handrail"]
    }
  },

  general: {
    label: "General / Building",
    color: "#7b8794",
    icon: "🏗", // construction
    books: ["IBC / IRC general", "Energy code", "Local amendments"],
    keywords: [
      "permit", "inspection", "egress", "means of egress", "occupancy",
      "fire rating", "fire separation", "smoke alarm", "carbon monoxide",
      "co alarm", "insulation", "r-value", "vapor barrier", "air barrier",
      "energy code", "iecc", "flashing", "weather resistant", "wrb",
      "foundation", "footing", "frost depth", "rebar", "reinforcement",
      "anchor", "setback", "clearance", "accessibility", "ada",
      "ceiling height", "light and ventilation", "window", "safety glazing",
      "tempered glass", "guard height", "landing", "ramp", "ibc", "irc"
    ],
    synonyms: {
      "egress": ["means of egress", "emergency escape", "eero"],
      "safety glass": ["tempered glass", "safety glazing"],
      "insulation": ["r-value", "iecc", "energy code"],
      "footing": ["foundation", "frost depth", "frost line"]
    }
  }
};

// Order used for chip rendering
const TRADE_ORDER = ["electrical", "plumbing", "hvac", "carpentry", "general"];

// Build a fast lookup: keyword -> [trade keys]
const KEYWORD_TO_TRADES = (() => {
  const map = {};
  for (const key of Object.keys(TRADES)) {
    for (const kw of TRADES[key].keywords) {
      const k = kw.toLowerCase();
      (map[k] = map[k] || []).push(key);
    }
  }
  return map;
})();

// Expand a search query using every trade's synonym table.
// Returns a de-duplicated array of terms to search for.
function expandQuery(query) {
  const base = query.trim().toLowerCase();
  if (!base) return [];
  const terms = new Set([base]);
  for (const key of Object.keys(TRADES)) {
    const syn = TRADES[key].synonyms || {};
    for (const head of Object.keys(syn)) {
      if (base === head || base.includes(head) || head.includes(base)) {
        terms.add(head);
        for (const s of syn[head]) terms.add(s.toLowerCase());
      }
      // also: if the query matches one of the synonym values, add the head + siblings
      for (const s of syn[head]) {
        if (base === s.toLowerCase()) {
          terms.add(head);
          for (const s2 of syn[head]) terms.add(s2.toLowerCase());
        }
      }
    }
  }
  return Array.from(terms);
}

if (typeof module !== "undefined") {
  module.exports = { TRADES, TRADE_ORDER, KEYWORD_TO_TRADES, expandQuery };
}
