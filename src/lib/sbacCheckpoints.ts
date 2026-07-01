// AUTO-GENERATED from the Semester 1 Proficiency System SBAC checkpoint bank.
// 19 checkpoints (Modules 1–2), each modeled on real SBAC items and tagged to a
// CCSS standard. 'Digital OK' items are numeric/short-answer and auto-gradeable.

export interface CheckpointMiss { answer: string; misconception: string; }
export interface CheckpointItem {
  q: string; a: string; ccss: string; dok: number; type: string;
  skill: string; mode: string; digital: boolean; misses: CheckpointMiss[];
}
export interface Checkpoint {
  id: string; module: string; moduleKey: string; topic: string; topicKey: string;
  lessonKey: string; date: string; covers: string; items: CheckpointItem[];
}

export const SBAC_CHECKPOINTS: Checkpoint[] = [
  {
    id: "M1T1-CP1", module: "Module 1", moduleKey: "M1", topic: "T1 Factors & Multiples", topicKey: "T1",
    lessonKey: "M1.T1", date: "2026-08-12", covers: "L1 Distributive Property",
    items: [
      { q: "Expand 4(2x + 3). Show each product.", a: "8x + 12", ccss: "6.EE.A.3", dok: 1, type: "fluency", skill: "distributive expand", mode: "Digital OK", digital: true, misses: [{ answer: "8x + 3", misconception: "distributes to first term only" }] },
      { q: "Factor the GCF: 6x + 9.", a: "3(2x + 3)", ccss: "6.EE.A.3", dok: 2, type: "fluency", skill: "factor out the GCF", mode: "Paper", digital: false, misses: [{ answer: "2(3x+4)", misconception: "factors out a common factor but not the greatest" }] },
      { q: "A box holds 4 packs, each with (x + 2) pencils. Write and simplify the total.", a: "4(x+2)=4x+8", ccss: "6.EE.A.3", dok: 1, type: "application", skill: "model with distributive", mode: "Digital OK", digital: true, misses: [{ answer: "4x+2", misconception: "distributes to first term only" }] },
      { q: "A student wrote 5(x + 2) = 5x + 2. Explain the error and fix it.", a: "5x+10; only first term was multiplied", ccss: "6.EE.A.3", dok: 2, type: "error-analysis", skill: "diagnose first-term-only", mode: "Paper", digital: false, misses: [{ answer: "agrees 5x+2", misconception: "distributes to first term only" }] },
      { q: "Use an area model to show 6(10+4) = 6·10 + 6·4. Explain why they're equal.", a: "60+24=84; areas of the two parts sum to the whole", ccss: "6.EE.A.3", dok: 2, type: "reasoning", skill: "justify equivalence with area model", mode: "Paper", digital: false, misses: [{ answer: "only finds 6·10", misconception: "distributes to first term only" }] },
      { q: "Fill in: 12 + 8 = 4(__ + __)", a: "4(3 + 2)", ccss: "6.EE.A.3", dok: 1, type: "fluency", skill: "factor a numeric sum", mode: "Digital OK", digital: true, misses: [{ answer: "4(3+8)", misconception: "factors only one term" }] },
    ],
  },
  {
    id: "M1T1-CP2", module: "Module 1", moduleKey: "M1", topic: "T1 Factors & Multiples", topicKey: "T1",
    lessonKey: "M1.T1", date: "2026-08-15", covers: "L2 Common Factors & Multiples (incl. exponents)",
    items: [
      { q: "Find the GCF of 12 and 18. List the factors you used.", a: "6", ccss: "6.NS.B.4", dok: 1, type: "fluency", skill: "find GCF", mode: "Digital OK", digital: true, misses: [{ answer: "36", misconception: "confuses GCF and LCM" }] },
      { q: "Find the LCM of 4 and 6. List multiples you used.", a: "12", ccss: "6.NS.B.4", dok: 1, type: "fluency", skill: "find LCM", mode: "Digital OK", digital: true, misses: [{ answer: "2", misconception: "confuses GCF and LCM" }] },
      { q: "Write 2·2·2 with an exponent, then evaluate.", a: "2^3 = 8", ccss: "6.EE.A.1", dok: 1, type: "fluency", skill: "exponent notation", mode: "Digital OK", digital: true, misses: [{ answer: "6", misconception: "confuses coefficient with exponent" }] },
      { q: "List all factors of 24.", a: "1,2,3,4,6,8,12,24", ccss: "6.NS.B.4", dok: 1, type: "fluency", skill: "find all factors", mode: "Digital OK", digital: true, misses: [{ answer: "missing pairs", misconception: "incomplete factor pairing" }] },
      { q: "Is finding the 'largest identical group size' a GCF or LCM task? Explain.", a: "GCF (greatest shared size)", ccss: "6.NS.B.4", dok: 2, type: "justify", skill: "identify GCF vs LCM structure", mode: "Paper", digital: false, misses: [{ answer: "LCM", misconception: "confuses GCF and LCM" }] },
      { q: "A student wrote 3^4 = 12. Explain the error and give the correct value.", a: "3·3·3·3 = 81", ccss: "6.EE.A.1", dok: 2, type: "error-analysis", skill: "diagnose exponent-as-multiplication", mode: "Paper", digital: false, misses: [{ answer: "12", misconception: "confuses coefficient with exponent" }] },
    ],
  },
  {
    id: "M1T1-CP3", module: "Module 1", moduleKey: "M1", topic: "T1 Factors & Multiples", topicKey: "T1",
    lessonKey: "M1.T1", date: "2026-08-21", covers: "L3 GCF & LCM + L4 Multiplying Fractions",
    items: [
      { q: "Find the LCM of 6 and 9.", a: "18", ccss: "6.NS.B.4", dok: 1, type: "fluency", skill: "find LCM", mode: "Digital OK", digital: true, misses: [{ answer: "3", misconception: "confuses GCF and LCM" }] },
      { q: "Two bells ring every 12 and 15 min. When together again? Show work and state what it means.", a: "60 minutes", ccss: "6.NS.B.4", dok: 2, type: "application", skill: "apply LCM in context", mode: "Paper", digital: false, misses: [{ answer: "3", misconception: "confuses GCF and LCM" }] },
      { q: "24 muffins & 36 cookies into identical boxes, none left. GCF or LCM? Explain, then solve.", a: "GCF = 12 boxes", ccss: "6.NS.B.4", dok: 3, type: "justify", skill: "decide GCF vs LCM, solve", mode: "Paper", digital: false, misses: [{ answer: "LCM/72", misconception: "confuses GCF and LCM" }] },
      { q: "Multiply 5/6 × 3/10 and simplify.", a: "15/60 = 1/4", ccss: "5.NF.B.4", dok: 1, type: "fluency", skill: "multiply fractions", mode: "Digital OK", digital: true, misses: [{ answer: "50/18", misconception: "multiplies fractions by cross-multiplying" }] },
      { q: "A recipe needs 3/4 cup sugar. You make 1/2 a recipe. How much sugar?", a: "3/8 cup", ccss: "5.NF.B.4", dok: 2, type: "application", skill: "multiply fractions in context", mode: "Paper", digital: false, misses: [{ answer: "3/4", misconception: "does not scale by the fraction" }] },
      { q: "Jordan wrote 2/3 × 4/5 = 10/12. Explain the mistake and give the correct product.", a: "Cross-multiplied; correct 8/15", ccss: "5.NF.B.4", dok: 2, type: "error-analysis", skill: "diagnose cross-multiply", mode: "Paper", digital: false, misses: [{ answer: "agrees 10/12", misconception: "multiplies fractions by cross-multiplying" }] },
      { q: "Find the GCF of 16 and 24.", a: "8", ccss: "6.NS.B.4", dok: 1, type: "fluency", skill: "find GCF", mode: "Digital OK", digital: true, misses: [{ answer: "48", misconception: "confuses GCF and LCM" }] },
    ],
  },
  {
    id: "M1T1-CP4", module: "Module 1", moduleKey: "M1", topic: "T1 Factors & Multiples", topicKey: "T1",
    lessonKey: "M1.T1", date: "2026-08-26", covers: "L5 Dividing Fractions",
    items: [
      { q: "Divide 1/2 ÷ 1/4.", a: "2", ccss: "6.NS.A.1", dok: 1, type: "fluency", skill: "divide fractions", mode: "Digital OK", digital: true, misses: [{ answer: "1/8", misconception: "does not invert divisor when dividing fractions" }] },
      { q: "Divide 3/4 ÷ 1/8.", a: "6", ccss: "6.NS.A.1", dok: 1, type: "fluency", skill: "divide fractions", mode: "Digital OK", digital: true, misses: [{ answer: "3/32", misconception: "does not invert divisor when dividing fractions" }] },
      { q: "A 6 ft ribbon is cut into 3/4 ft pieces. How many pieces? Explain why division fits.", a: "8", ccss: "6.NS.A.1", dok: 2, type: "application", skill: "interpret fraction division", mode: "Paper", digital: false, misses: [{ answer: "4.5", misconception: "does not invert divisor when dividing fractions" }] },
      { q: "To compute 4/5 ÷ 2/3, Sam multiplied 4/5 × 2/3. Explain why that's wrong; show the correct first step and answer.", a: "Didn't invert; 4/5 × 3/2 = 6/5 = 1 1/5", ccss: "6.NS.A.1", dok: 2, type: "error-analysis", skill: "reciprocal of the divisor", mode: "Paper", digital: false, misses: [{ answer: "8/15", misconception: "does not invert divisor when dividing fractions" }] },
      { q: "Without computing exactly, explain why 5 ÷ 1/3 is greater than 5. Then give the quotient.", a: "÷ by <1 makes more groups; 15", ccss: "6.NS.A.1", dok: 2, type: "reasoning", skill: "reason about dividing by <1", mode: "Paper", digital: false, misses: [{ answer: "5/3", misconception: "does not invert divisor when dividing fractions" }] },
      { q: "Divide 3/5 ÷ 2/5.", a: "3/2 = 1 1/2", ccss: "6.NS.A.1", dok: 1, type: "fluency", skill: "divide fractions", mode: "Digital OK", digital: true, misses: [{ answer: "6/25", misconception: "does not invert divisor when dividing fractions" }] },
    ],
  },
  {
    id: "M1T2-CP1", module: "Module 1", moduleKey: "M1", topic: "T2 Area/Volume/SA", topicKey: "T2",
    lessonKey: "M1.T2", date: "2026-09-03", covers: "L1 Area of Triangles & Quadrilaterals",
    items: [
      { q: "Area of a triangle with base 12, height 5. Show the formula.", a: "30 sq units", ccss: "6.G.A.1", dok: 1, type: "fluency", skill: "triangle area ½bh", mode: "Digital OK", digital: true, misses: [{ answer: "60", misconception: "forgets to halve base × height for triangle area" }] },
      { q: "Area of a parallelogram with base 10, height 3.", a: "30 sq units", ccss: "6.G.A.1", dok: 1, type: "fluency", skill: "parallelogram area", mode: "Digital OK", digital: true, misses: [{ answer: "13", misconception: "adds dimensions instead of multiplying" }] },
      { q: "Mia found a triangle's area (base 10, height 4) = 40. What did she forget? Correct it.", a: "Forgot to halve; 20 sq units", ccss: "6.G.A.1", dok: 2, type: "error-analysis", skill: "diagnose missing ½", mode: "Paper", digital: false, misses: [{ answer: "40", misconception: "forgets to halve base × height for triangle area" }] },
      { q: "For a 6 by 4 rectangle, find BOTH area and perimeter; label the units for each.", a: "Area 24 sq units; Perimeter 20 units", ccss: "6.G.A.1", dok: 2, type: "reasoning", skill: "distinguish area vs perimeter", mode: "Paper", digital: false, misses: [{ answer: "uses 20 as area", misconception: "confuses area vs perimeter" }] },
      { q: "A triangular sail has base 9 ft, height 6 ft. Find its area.", a: "27 sq ft", ccss: "6.G.A.1", dok: 2, type: "application", skill: "apply triangle area", mode: "Paper", digital: false, misses: [{ answer: "54", misconception: "forgets to halve base × height for triangle area" }] },
      { q: "Area of a square with side 7.", a: "49 sq units", ccss: "6.G.A.1", dok: 1, type: "fluency", skill: "square area", mode: "Digital OK", digital: true, misses: [{ answer: "28", misconception: "computes perimeter" }] },
      { q: "Explain why a triangle is half of the rectangle with the same base and height.", a: "Two copies of the triangle fill the rectangle", ccss: "6.G.A.1", dok: 2, type: "reasoning", skill: "justify the ½ in triangle area", mode: "Paper", digital: false, misses: [{ answer: "says they're equal", misconception: "forgets to halve base × height for triangle area" }] },
    ],
  },
  {
    id: "M1T2-CP2", module: "Module 1", moduleKey: "M1", topic: "T2 Area/Volume/SA", topicKey: "T2",
    lessonKey: "M1.T2", date: "2026-09-09", covers: "L2 Composite Figures",
    items: [
      { q: "A figure = rectangle 8×3 joined to a triangle (base 8, height 4). Total area? Show each part.", a: "24+16 = 40 sq units", ccss: "6.G.A.1", dok: 2, type: "fluency", skill: "decompose composite", mode: "Paper", digital: false, misses: [{ answer: "56", misconception: "forgets to halve base × height for triangle area" }] },
      { q: "An L-shaped room splits into a 12×8 and a 4×5 rectangle. How much carpet?", a: "96+20 = 116 sq ft", ccss: "6.G.A.1", dok: 2, type: "application", skill: "apply composite area", mode: "Paper", digital: false, misses: [{ answer: "29", misconception: "adds dimensions instead of areas" }] },
      { q: "Rectangle 10×5 with a 2×2 square removed. Area?", a: "50−4 = 46 sq units", ccss: "6.G.A.1", dok: 2, type: "fluency", skill: "subtract to find area", mode: "Digital OK", digital: true, misses: [{ answer: "46→54", misconception: "adds the removed piece instead of subtracting" }] },
      { q: "Describe two different ways to decompose an L-shape to find its area. Why do they give the same total?", a: "Split horizontally or vertically; both partition the same region", ccss: "6.G.A.1", dok: 3, type: "justify", skill: "reason about decomposition", mode: "Paper", digital: false, misses: [{ answer: "adds outside lengths", misconception: "confuses area vs perimeter" }] },
      { q: "A student found a composite area by adding all the outside lengths. Explain the error.", a: "That's perimeter; area = sum of the pieces' areas", ccss: "6.G.A.1", dok: 2, type: "error-analysis", skill: "diagnose area-vs-perimeter", mode: "Paper", digital: false, misses: [{ answer: "keeps the perimeter", misconception: "confuses area vs perimeter" }] },
      { q: "Two rectangles 5×2 and 5×6 joined. Total area?", a: "10+30 = 40 sq units", ccss: "6.G.A.1", dok: 1, type: "fluency", skill: "sum component areas", mode: "Digital OK", digital: true, misses: [{ answer: "18", misconception: "adds dimensions instead of areas" }] },
    ],
  },
  {
    id: "M1T2-CP3", module: "Module 1", moduleKey: "M1", topic: "T2 Area/Volume/SA", topicKey: "T2",
    lessonKey: "M1.T2", date: "2026-09-16", covers: "L3 Volume (incl. fractional edges)",
    items: [
      { q: "Volume of a box 3 × 4 × 5.", a: "60 cubic units", ccss: "6.G.A.2", dok: 1, type: "fluency", skill: "volume = l·w·h", mode: "Digital OK", digital: true, misses: [{ answer: "12", misconception: "adds dimensions instead of multiplying for volume" }] },
      { q: "Volume of a cube with side 4.", a: "64 cubic units", ccss: "6.G.A.2", dok: 1, type: "fluency", skill: "cube volume", mode: "Digital OK", digital: true, misses: [{ answer: "16", misconception: "computes one face area" }] },
      { q: "A box is 1/2 ft × 3 ft × 2 ft. Find its volume; explain how the 1/2 affects it.", a: "3 cubic ft", ccss: "6.G.A.2", dok: 2, type: "application", skill: "volume with fractional edge", mode: "Paper", digital: false, misses: [{ answer: "6", misconception: "treats fractional edge as a whole number" }] },
      { q: "A student labeled a box's volume in square units. Explain why that's wrong; give the correct unit.", a: "Cubic units (fills 3-D space)", ccss: "6.G.A.2", dok: 2, type: "justify", skill: "units of volume", mode: "Paper", digital: false, misses: [{ answer: "square units", misconception: "uses area instead of volume" }] },
      { q: "A fish tank is 20 × 10 × 12 in. Find its volume.", a: "2,400 cubic in", ccss: "6.G.A.2", dok: 2, type: "application", skill: "apply volume", mode: "Paper", digital: false, misses: [{ answer: "42", misconception: "adds dimensions instead of multiplying for volume" }] },
      { q: "How many 1/2-unit cubes fill a 1×1×1 cube? Explain.", a: "8", ccss: "6.G.A.2", dok: 2, type: "reasoning", skill: "reason about fractional unit cubes", mode: "Paper", digital: false, misses: [{ answer: "2", misconception: "treats fractional edge as a whole number" }] },
      { q: "Volume of a box 5 × 3 × 2.", a: "30 cubic units", ccss: "6.G.A.2", dok: 1, type: "fluency", skill: "volume", mode: "Digital OK", digital: true, misses: [{ answer: "10", misconception: "adds dimensions instead of multiplying for volume" }] },
    ],
  },
  {
    id: "M1T2-CP4", module: "Module 1", moduleKey: "M1", topic: "T2 Area/Volume/SA", topicKey: "T2",
    lessonKey: "M1.T2", date: "2026-09-23", covers: "L4 Surface Area",
    items: [
      { q: "Surface area of a cube with side 3. Show the faces.", a: "6×9 = 54 sq units", ccss: "6.G.A.4", dok: 2, type: "fluency", skill: "SA = sum of 6 faces", mode: "Digital OK", digital: true, misses: [{ answer: "27", misconception: "confuses surface area and volume" }] },
      { q: "Surface area of a box 2 × 3 × 4.", a: "2(6+8+12)=52 sq units", ccss: "6.G.A.4", dok: 2, type: "fluency", skill: "SA of rectangular prism", mode: "Paper", digital: false, misses: [{ answer: "24", misconception: "confuses surface area and volume" }] },
      { q: "Devon said the SA of a cube with side 4 is 64. Explain the error; give the correct SA.", a: "64 is the volume; SA = 96", ccss: "6.G.A.4", dok: 2, type: "error-analysis", skill: "separate SA from volume", mode: "Paper", digital: false, misses: [{ answer: "64", misconception: "confuses surface area and volume" }] },
      { q: "A gift box is 5 × 4 × 3 in. How much wrapping paper (SA)?", a: "2(20+15+12)=94 sq in", ccss: "6.G.A.4", dok: 2, type: "application", skill: "apply SA via nets", mode: "Paper", digital: false, misses: [{ answer: "60", misconception: "confuses surface area and volume" }] },
      { q: "A box has 6 faces. Explain why you must add all six (not just the visible ones) for surface area.", a: "All faces are part of the surface", ccss: "6.G.A.4", dok: 2, type: "justify", skill: "reason about full surface", mode: "Paper", digital: false, misses: [{ answer: "adds 3 faces", misconception: "counts only visible faces for surface area" }] },
      { q: "Surface area of a cube with side 2.", a: "24 sq units", ccss: "6.G.A.4", dok: 1, type: "fluency", skill: "cube SA", mode: "Digital OK", digital: true, misses: [{ answer: "8", misconception: "confuses surface area and volume" }] },
    ],
  },
  {
    id: "M1T3-CP1", module: "Module 1", moduleKey: "M1", topic: "T3 Decimals", topicKey: "T3",
    lessonKey: "M1.T3", date: "2026-09-30", covers: "L1 Plot/Order/Compare + L2 Add & Subtract Decimals",
    items: [
      { q: "Order 0.5, 0.45, 0.54 least to greatest; explain how place value decides.", a: "0.45, 0.5, 0.54", ccss: "5.NBT.A.3b", dok: 2, type: "justify", skill: "order decimals by place value", mode: "Paper", digital: false, misses: [{ answer: "0.5,0.45,0.54 by digit count", misconception: "compares decimals by length not place value" }] },
      { q: "Compare with <, >, =:  0.7 ___ 0.65", a: "0.7 > 0.65", ccss: "5.NBT.A.3b", dok: 1, type: "fluency", skill: "compare decimals", mode: "Digital OK", digital: true, misses: [{ answer: "<", misconception: "compares decimals by length not place value" }] },
      { q: "Alex says 0.70 > 0.7 because it has more digits. Explain why that's wrong.", a: "Equal: 0.70 = 0.7", ccss: "5.NBT.A.3b", dok: 2, type: "error-analysis", skill: "equivalent decimals", mode: "Paper", digital: false, misses: [{ answer: "0.70>0.7", misconception: "compares decimals by length not place value" }] },
      { q: "12.4 − 5.27. Line up and show your work.", a: "7.13", ccss: "6.NS.B.3", dok: 1, type: "fluency", skill: "subtract decimals aligned", mode: "Digital OK", digital: true, misses: [{ answer: "7.23", misconception: "misaligns place value adding/subtracting decimals" }] },
      { q: "Sam added 3.4 + 2.15 by lining up the right ends and got 3.61. Explain and correct.", a: "Misaligned; 5.55", ccss: "6.NS.B.3", dok: 2, type: "error-analysis", skill: "diagnose alignment error", mode: "Paper", digital: false, misses: [{ answer: "3.61", misconception: "misaligns place value adding/subtracting decimals" }] },
      { q: "You have $20.00 and spend $7.45 and $5.30. How much is left?", a: "$7.25", ccss: "6.NS.B.3", dok: 2, type: "application", skill: "apply decimal subtraction", mode: "Paper", digital: false, misses: [{ answer: "misaligned result", misconception: "misaligns place value adding/subtracting decimals" }] },
      { q: "In 4.276, the 7 is in the ___ place.", a: "hundredths", ccss: "5.NBT.A.3b", dok: 1, type: "fluency", skill: "decimal place value", mode: "Digital OK", digital: true, misses: [{ answer: "tenths", misconception: "miscounts decimal place value" }] },
    ],
  },
  {
    id: "M1T3-CP2", module: "Module 1", moduleKey: "M1", topic: "T3 Decimals", topicKey: "T3",
    lessonKey: "M1.T3", date: "2026-10-08", covers: "L3 Multiply + L4 Divide Decimals",
    items: [
      { q: "3.2 × 1.5. Place the decimal point.", a: "4.8", ccss: "6.NS.B.3", dok: 1, type: "fluency", skill: "multiply decimals", mode: "Digital OK", digital: true, misses: [{ answer: "48", misconception: "miscounts decimal places when multiplying decimals" }] },
      { q: "Apples cost $1.20/lb. You buy 3.5 lb. Total cost?", a: "$4.20", ccss: "6.NS.B.3", dok: 2, type: "application", skill: "apply decimal multiplication", mode: "Paper", digital: false, misses: [{ answer: "$42.00", misconception: "miscounts decimal places when multiplying decimals" }] },
      { q: "Without computing exactly, explain why 0.3 × 0.4 must be less than 0.4. Then give the product.", a: "×0.3 (<1) shrinks it; 0.12", ccss: "6.NS.B.3", dok: 3, type: "reasoning", skill: "reason about ×(<1)", mode: "Paper", digital: false, misses: [{ answer: "1.2", misconception: "miscounts decimal places when multiplying decimals" }] },
      { q: "7.2 ÷ 0.9. Show how you scale the divisor.", a: "8", ccss: "6.NS.B.3", dok: 2, type: "fluency", skill: "divide by a decimal", mode: "Paper", digital: false, misses: [{ answer: "0.8", misconception: "misplaces decimal in division" }] },
      { q: "A 4.5 m rope is cut into 0.5 m pieces. How many pieces? Explain why division fits.", a: "9", ccss: "6.NS.B.3", dok: 2, type: "application", skill: "interpret decimal division", mode: "Paper", digital: false, misses: [{ answer: "0.9", misconception: "misplaces decimal in division" }] },
      { q: "Explain why 6 ÷ 0.2 is greater than 6, then give the quotient.", a: "÷ by <1 → more groups; 30", ccss: "6.NS.B.3", dok: 3, type: "reasoning", skill: "reason about ÷(<1)", mode: "Paper", digital: false, misses: [{ answer: "0.3 or 3", misconception: "misplaces decimal in division" }] },
      { q: "0.6 × 0.7.", a: "0.42", ccss: "6.NS.B.3", dok: 1, type: "fluency", skill: "multiply decimals", mode: "Digital OK", digital: true, misses: [{ answer: "4.2", misconception: "miscounts decimal places when multiplying decimals" }] },
    ],
  },
  {
    id: "M2T1-CP1", module: "Module 2", moduleKey: "M2", topic: "T1 Ratios", topicKey: "T1",
    lessonKey: "M2.T1", date: "2026-10-15", covers: "L1 Introduction to Ratios",
    items: [
      { q: "A bag has 3 red and 5 blue marbles. Write the ratio of red to blue.", a: "3:5", ccss: "6.RP.A.1", dok: 1, type: "fluency", skill: "write a ratio in order", mode: "Digital OK", digital: true, misses: [{ answer: "5:3", misconception: "writes the ratio in the wrong order" }] },
      { q: "The ratio of dogs to cats in the drawings is 2:3. Explain what 2:3 means using the phrase 'for every'.", a: "For every 2 dogs there are 3 cats", ccss: "6.RP.A.1", dok: 2, type: "reasoning", skill: "interpret the meaning of a ratio in context", mode: "Paper", digital: false, misses: [{ answer: "2 out of every 3 are dogs", misconception: "confuses part-to-part with part-to-whole ratio" }] },
      { q: "Ratio of boys to total students is 4:9. Is 4:9 part-to-part or part-to-whole? Explain.", a: "Part-to-whole (boys to total)", ccss: "6.RP.A.1", dok: 2, type: "justify", skill: "distinguish part-part vs part-whole", mode: "Paper", digital: false, misses: [{ answer: "part-to-part", misconception: "confuses part-to-part with part-to-whole ratio" }] },
      { q: "A recipe uses sugar:flour = 2:3. A student says 'add 2 to each' to scale up, giving 4:5. Explain the error.", a: "Ratios scale by multiplying, not adding; 4:6 keeps 2:3", ccss: "6.RP.A.1", dok: 2, type: "error-analysis", skill: "diagnose additive ratio error", mode: "Paper", digital: false, misses: [{ answer: "4:5 is fine", misconception: "treats ratio as additive" }] },
      { q: "Abbie 🐾 gets 2 treats for every 3 tricks. Write this ratio two different ways: using the word 'to', and as a fraction.", a: "2 to 3; and 2/3", ccss: "6.RP.A.1", dok: 1, type: "fluency", skill: "represent a ratio in multiple forms (to / fraction)", mode: "Digital OK", digital: true, misses: [{ answer: "3 to 2 / 3/2", misconception: "inverts the ratio when writing it as a fraction" }] },
      { q: "Explain the difference between '2 cups water to 1 cup juice' and 'water is 2/3 of the mix'.", a: "2:1 is part-to-part; 2/3 is part-to-whole of 3 total", ccss: "6.RP.A.1", dok: 2, type: "reasoning", skill: "relate ratio forms", mode: "Paper", digital: false, misses: [{ answer: "they're the same", misconception: "confuses part-to-part with part-to-whole ratio" }] },
    ],
  },
  {
    id: "M2T1-CP2", module: "Module 2", moduleKey: "M2", topic: "T1 Ratios", topicKey: "T1",
    lessonKey: "M2.T1", date: "2026-10-22", covers: "L2 Equivalent Ratios + L3 Ratio Tables / Double Number Lines",
    items: [
      { q: "Write two ratios equivalent to 2:5.", a: "4:10, 6:15 (e.g.)", ccss: "6.RP.A.3", dok: 1, type: "fluency", skill: "generate equivalent ratios", mode: "Digital OK", digital: true, misses: [{ answer: "4:7", misconception: "treats ratio as additive" }] },
      { q: "A ratio table: 3 pens cost $2. Complete: 9 pens cost $__; 15 pens cost $__.", a: "$6; $10", ccss: "6.RP.A.3", dok: 2, type: "application", skill: "scale a ratio table", mode: "Paper", digital: false, misses: [{ answer: "$8; $14", misconception: "treats ratio as additive" }] },
      { q: "On a double number line, 4 cups flour pairs with 6 eggs. How many eggs for 2 cups?", a: "3 eggs", ccss: "6.RP.A.3", dok: 2, type: "application", skill: "use a double number line", mode: "Paper", digital: false, misses: [{ answer: "4", misconception: "treats ratio as additive" }] },
      { q: "A student says 3:4 and 6:7 are equivalent because they added 3 to each. Explain why not.", a: "×2 gives 6:8; equivalent ratios scale by multiplication", ccss: "6.RP.A.3", dok: 2, type: "error-analysis", skill: "diagnose additive scaling", mode: "Paper", digital: false, misses: [{ answer: "6:7 equivalent", misconception: "treats ratio as additive" }] },
      { q: "A table shows 2:5, 4:10, 6:?. What is ? and how did you know?", a: "15; each row multiplies 2:5 by the same factor", ccss: "6.RP.A.3", dok: 2, type: "reasoning", skill: "reason about multiplicative structure", mode: "Paper", digital: false, misses: [{ answer: "13", misconception: "treats ratio as additive" }] },
      { q: "Is 6:9 equivalent to 2:3? Show why.", a: "Yes; 6:9 ÷3 = 2:3", ccss: "6.RP.A.3", dok: 1, type: "fluency", skill: "check equivalence", mode: "Digital OK", digital: true, misses: [{ answer: "no", misconception: "treats ratio as additive" }] },
      { q: "3 dog treats per 12 minutes of training. At the same rate, treats in 36 minutes?", a: "9 treats", ccss: "6.RP.A.3", dok: 2, type: "application", skill: "scale within a context", mode: "Paper", digital: false, misses: [{ answer: "27", misconception: "writes the ratio in the wrong order" }] },
      { q: "Simplify the ratio 10:15 to lowest terms.", a: "2:3", ccss: "6.RP.A.3", dok: 1, type: "fluency", skill: "simplify a ratio", mode: "Digital OK", digital: true, misses: [{ answer: "5:10", misconception: "divides only one term" }] },
    ],
  },
  {
    id: "M2T1-CP3", module: "Module 2", moduleKey: "M2", topic: "T1 Ratios", topicKey: "T1",
    lessonKey: "M2.T1", date: "2026-10-28", covers: "L4 Graphs of Ratios (ratio tables → coordinate plane)",
    items: [
      { q: "Plot the ratio 1:2 as points for 1,2,3 of the first quantity. List the ordered pairs.", a: "(1,2),(2,4),(3,6)", ccss: "6.RP.A.3a", dok: 2, type: "application", skill: "plot equivalent ratios", mode: "Paper", digital: false, misses: [{ answer: "(1,2),(2,3),(3,4)", misconception: "treats ratio as additive" }] },
      { q: "Why do equivalent ratios fall on a straight line through the origin?", a: "Each pair is the same multiple; constant rate → line through (0,0)", ccss: "6.RP.A.3a", dok: 2, type: "reasoning", skill: "reason about ratio graphs", mode: "Paper", digital: false, misses: [{ answer: "they don't", misconception: "treats ratio as additive" }] },
      { q: "A graph passes through (2,6) for cups:calories. What point shows 1 cup?", a: "(1,3)", ccss: "6.RP.A.3a", dok: 1, type: "fluency", skill: "read a unit point from a graph", mode: "Digital OK", digital: true, misses: [{ answer: "(1,5)", misconception: "treats ratio as additive" }] },
      { q: "A student plotted 2:3 as (3,2). Explain the ordering error if the table is (first quantity, second quantity).", a: "Axes/order reversed; should be (2,3)", ccss: "6.RP.A.3a", dok: 2, type: "error-analysis", skill: "diagnose coordinate order", mode: "Paper", digital: false, misses: [{ answer: "(3,2) is fine", misconception: "writes the ratio in the wrong order" }] },
      { q: "From the graph through (4,10), how many of the 2nd quantity for 6 of the first?", a: "15", ccss: "6.RP.A.3a", dok: 2, type: "application", skill: "extend a ratio graph", mode: "Paper", digital: false, misses: [{ answer: "12", misconception: "treats ratio as additive" }] },
      { q: "Do the points (1,4),(2,8),(3,12) show equivalent ratios? Explain.", a: "Yes; all equal 1:4", ccss: "6.RP.A.3a", dok: 1, type: "fluency", skill: "verify equivalence on a graph", mode: "Digital OK", digital: true, misses: [{ answer: "no", misconception: "treats ratio as additive" }] },
    ],
  },
  {
    id: "M2T1-CP4", module: "Module 2", moduleKey: "M2", topic: "T1 Ratios", topicKey: "T1",
    lessonKey: "M2.T1", date: "2026-11-02", covers: "L5 Graphs of Ratios (interpreting / 'They're Growing!')",
    items: [
      { q: "Two plants: A grows 2 in per week, B grows 3 in per week. After 4 weeks, how much taller is B than A?", a: "B is 4 in taller (12 vs 8)", ccss: "6.RP.A.3a", dok: 2, type: "application", skill: "compare rates from graphs", mode: "Paper", digital: false, misses: [{ answer: "1 in", misconception: "treats ratio as additive" }] },
      { q: "Two ratio lines from the origin: which is steeper, 1:2 or 1:3? Explain what steeper means here.", a: "1:3 (more 2nd-quantity per 1) is steeper", ccss: "6.RP.A.3a", dok: 2, type: "reasoning", skill: "interpret steepness as rate", mode: "Paper", digital: false, misses: [{ answer: "1:2", misconception: "misreads slope as rate" }] },
      { q: "A line passes through (3,9). What is the second quantity per 1 of the first?", a: "3", ccss: "6.RP.A.3a", dok: 1, type: "fluency", skill: "find the unit rate from a graph", mode: "Digital OK", digital: true, misses: [{ answer: "6", misconception: "treats ratio as additive" }] },
      { q: "From a graph, 5 tickets cost $20. Plot/peer: what does the point (1, ?) show?", a: "(1, 4) — $4 per ticket", ccss: "6.RP.A.3a", dok: 2, type: "application", skill: "unit point meaning", mode: "Paper", digital: false, misses: [{ answer: "(1,15)", misconception: "treats ratio as additive" }] },
      { q: "A student says a steeper ratio line always means larger numbers. Explain what steeper actually shows.", a: "Steeper = greater rate (more per 1), not just bigger values", ccss: "6.RP.A.3a", dok: 2, type: "error-analysis", skill: "diagnose slope misread", mode: "Paper", digital: false, misses: [{ answer: "agrees", misconception: "misreads slope as rate" }] },
      { q: "On a cups:calories graph through (2,160), how many calories for 5 cups?", a: "400", ccss: "6.RP.A.3a", dok: 1, type: "fluency", skill: "extend a proportional graph", mode: "Digital OK", digital: true, misses: [{ answer: "163", misconception: "treats ratio as additive" }] },
    ],
  },
  {
    id: "M2T1-CP5", module: "Module 2", moduleKey: "M2", topic: "T1 Ratios", topicKey: "T1",
    lessonKey: "M2.T1", date: "2026-11-05", covers: "L6 Using & Comparing Ratio Representations",
    items: [
      { q: "Which is the better deal: 3 bars for $4 (table) or a graph showing 5 bars for $6? Show work and explain.", a: "5 for $6 = $1.20/bar < 3 for $4 ≈ $1.33/bar → 5/$6 better", ccss: "6.RP.A.3a", dok: 3, type: "justify", skill: "compare across representations", mode: "Paper", digital: false, misses: [{ answer: "3 for $4", misconception: "doesn't convert to a common unit before comparing" }] },
      { q: "Represent 2:5 as a table (3 rows), and as one ordered pair on a graph.", a: "Table 2:5,4:10,6:15; point e.g. (2,5)", ccss: "6.RP.A.3a", dok: 2, type: "application", skill: "move between representations", mode: "Paper", digital: false, misses: [{ answer: "4:7 row", misconception: "treats ratio as additive" }] },
      { q: "A double number line and a ratio table both show 4:6. Explain how each shows the same relationship.", a: "Both show pairs that scale by the same factor", ccss: "6.RP.A.3a", dok: 2, type: "reasoning", skill: "connect representations", mode: "Paper", digital: false, misses: [{ answer: "they differ", misconception: "treats ratio as additive" }] },
      { q: "A student compares 2:3 and 4:5 by saying both 'go up by 1', so equal. Explain the error.", a: "Rates differ (0.67 vs 0.80); compare by unit rate, not differences", ccss: "6.RP.A.3a", dok: 2, type: "error-analysis", skill: "diagnose additive comparison", mode: "Paper", digital: false, misses: [{ answer: "equal", misconception: "treats ratio as additive" }] },
      { q: "Write the unit rate for 6 cups : 3 servings.", a: "2 cups per serving", ccss: "6.RP.A.3a", dok: 1, type: "fluency", skill: "find a unit rate", mode: "Digital OK", digital: true, misses: [{ answer: "0.5", misconception: "inverts the unit rate (wrong quantity per 1)" }] },
      { q: "Abbie 🐾 walks: 2 miles in 30 min (table) vs 3 miles in 50 min (graph). Which pace is faster? Show.", a: "30/2=15 min/mi vs 50/3≈16.7 min/mi → 2 mi/30 min faster", ccss: "6.RP.A.3a", dok: 2, type: "application", skill: "compare rates across forms", mode: "Paper", digital: false, misses: [{ answer: "3 mi/50 min", misconception: "doesn't convert to a common unit before comparing" }] },
    ],
  },
  {
    id: "M2T2-CP1", module: "Module 2", moduleKey: "M2", topic: "T2 Percents", topicKey: "T2",
    lessonKey: "M2.T2", date: "2026-11-12", covers: "L1 Percent, Fraction & Decimal Equivalence",
    items: [
      { q: "Write 25% as a fraction and a decimal.", a: "1/4 and 0.25", ccss: "6.RP.A.3c", dok: 1, type: "fluency", skill: "percent↔fraction↔decimal", mode: "Digital OK", digital: true, misses: [{ answer: "25 and 25.0", misconception: "treats percent as the actual number (ignores /100)" }] },
      { q: "Write 0.6 as a percent.", a: "60%", ccss: "6.RP.A.3c", dok: 1, type: "fluency", skill: "decimal→percent", mode: "Digital OK", digital: true, misses: [{ answer: "0.6%", misconception: "treats percent as the actual number (ignores /100)" }] },
      { q: "A bar model shows 3 of 10 squares shaded. What percent is shaded?", a: "30%", ccss: "6.RP.A.3c", dok: 2, type: "application", skill: "percent from a model", mode: "Paper", digital: false, misses: [{ answer: "3%", misconception: "treats percent as the actual number (ignores /100)" }] },
      { q: "A student wrote 1/2 = 2%. Explain the error and give the correct percent.", a: "1/2 = 50%", ccss: "6.RP.A.3c", dok: 2, type: "error-analysis", skill: "diagnose fraction→percent error", mode: "Paper", digital: false, misses: [{ answer: "2%", misconception: "treats percent as the actual number (ignores /100)" }] },
      { q: "Order from least to greatest: 0.4, 35%, 1/2.", a: "35%, 0.4, 1/2", ccss: "6.RP.A.3c", dok: 1, type: "fluency", skill: "compare across forms", mode: "Paper", digital: false, misses: [{ answer: "0.4, 35%, 1/2", misconception: "treats percent as the actual number (ignores /100)" }] },
      { q: "Explain why 'percent' means 'per 100' using 75%.", a: "75% = 75 per 100 = 75/100 = 3/4", ccss: "6.RP.A.3c", dok: 2, type: "reasoning", skill: "reason about per-100 meaning", mode: "Paper", digital: false, misses: [{ answer: "75% = 75", misconception: "treats percent as the actual number (ignores /100)" }] },
    ],
  },
  {
    id: "M2T2-CP2", module: "Module 2", moduleKey: "M2", topic: "T2 Percents", topicKey: "T2",
    lessonKey: "M2.T2", date: "2026-11-19", covers: "L2 Benchmark/Estimation + L3 Part & Whole in Percent Problems",
    items: [
      { q: "What is 20% of 60?", a: "12", ccss: "6.RP.A.3c", dok: 2, type: "application", skill: "find a part given percent & whole", mode: "Paper", digital: false, misses: [{ answer: "3", misconception: "reverses part and whole in percent" }] },
      { q: "15 is 25% of what number?", a: "60", ccss: "6.RP.A.3c", dok: 2, type: "application", skill: "find the whole given part & percent", mode: "Paper", digital: false, misses: [{ answer: "3.75", misconception: "reverses part and whole in percent" }] },
      { q: "Estimate 48% of 200 using a benchmark. Explain.", a: "≈100 (about half of 200)", ccss: "6.RP.A.3c", dok: 2, type: "application", skill: "estimate with benchmark percents", mode: "Paper", digital: false, misses: [{ answer: "96 only, no benchmark", misconception: "misses the benchmark reasoning" }] },
      { q: "To find 'what is 30% of 50', a student computed 50 ÷ 30. Explain the error; give the right answer.", a: "Should be 0.30 × 50 = 15", ccss: "6.RP.A.3c", dok: 2, type: "error-analysis", skill: "diagnose part/whole setup", mode: "Paper", digital: false, misses: [{ answer: "1.67", misconception: "reverses part and whole in percent" }] },
      { q: "A shirt is $40 with 25% off. Is the sale price $10 or $30? Explain.", a: "$30 (discount is $10, subtract from $40)", ccss: "6.RP.A.3c", dok: 3, type: "justify", skill: "interpret percent in context", mode: "Paper", digital: false, misses: [{ answer: "$10", misconception: "confuses the part with the remaining whole" }] },
      { q: "Find 10% of 80.", a: "8", ccss: "6.RP.A.3c", dok: 1, type: "fluency", skill: "find 10% benchmark", mode: "Digital OK", digital: true, misses: [{ answer: "800", misconception: "treats percent as the actual number (ignores /100)" }] },
      { q: "A team won 18 of 24 games. What percent did they win?", a: "75%", ccss: "6.RP.A.3c", dok: 2, type: "application", skill: "percent from part & whole", mode: "Paper", digital: false, misses: [{ answer: "18%", misconception: "reverses part and whole in percent" }] },
      { q: "Use 50% and 10% benchmarks to find 60% of 30. Show the steps.", a: "15 + 3 = 18", ccss: "6.RP.A.3c", dok: 2, type: "reasoning", skill: "compose benchmark percents", mode: "Paper", digital: false, misses: [{ answer: "60", misconception: "treats percent as the actual number (ignores /100)" }] },
    ],
  },
  {
    id: "M2T3-CP1", module: "Module 2", moduleKey: "M2", topic: "T3 Unit Rates & Conversions", topicKey: "T3",
    lessonKey: "M2.T3", date: "2026-11-25", covers: "L1 Using Ratio Reasoning to Convert Units",
    items: [
      { q: "Convert 3 feet to inches (12 in = 1 ft).", a: "36 inches", ccss: "6.RP.A.3d", dok: 1, type: "fluency", skill: "convert within a system", mode: "Digital OK", digital: true, misses: [{ answer: "0.25", misconception: "confuses which quantity is being converted" }] },
      { q: "A recipe needs 2 quarts of milk. How many cups? (4 cups = 1 quart)", a: "8 cups", ccss: "6.RP.A.3d", dok: 2, type: "application", skill: "apply unit conversion", mode: "Paper", digital: false, misses: [{ answer: "0.5", misconception: "confuses which quantity is being converted" }] },
      { q: "A car travels 120 km. About how many miles? (1 mi ≈ 1.6 km)", a: "75 miles", ccss: "6.RP.A.3d", dok: 2, type: "application", skill: "convert between systems", mode: "Paper", digital: false, misses: [{ answer: "192", misconception: "multiplies when should divide" }] },
      { q: "To convert 48 inches to feet a student multiplied by 12. Explain the error; give the answer.", a: "Divide by 12; 4 feet", ccss: "6.RP.A.3d", dok: 2, type: "error-analysis", skill: "diagnose conversion direction", mode: "Paper", digital: false, misses: [{ answer: "576", misconception: "multiplies when should divide" }] },
      { q: "When converting feet to inches, do you expect more or fewer units? Explain.", a: "More (inches are smaller, so more of them)", ccss: "6.RP.A.3d", dok: 2, type: "reasoning", skill: "reason about unit size", mode: "Paper", digital: false, misses: [{ answer: "fewer", misconception: "confuses which quantity is being converted" }] },
      { q: "Convert 2.5 kg to grams (1000 g = 1 kg).", a: "2500 g", ccss: "6.RP.A.3d", dok: 1, type: "fluency", skill: "convert metric units", mode: "Digital OK", digital: true, misses: [{ answer: "0.0025", misconception: "confuses which quantity is being converted" }] },
    ],
  },
  {
    id: "M2T3-CP2", module: "Module 2", moduleKey: "M2", topic: "T3 Unit Rates & Conversions", topicKey: "T3",
    lessonKey: "M2.T3", date: "2026-12-02", covers: "L2 Introduction to Unit Rates (best buy)",
    items: [
      { q: "A car goes 150 miles on 5 gallons. Find the unit rate (miles per gallon).", a: "30 mi/gal", ccss: "6.RP.A.2", dok: 1, type: "fluency", skill: "compute a unit rate", mode: "Digital OK", digital: true, misses: [{ answer: "0.033", misconception: "inverts the unit rate (wrong quantity per 1)" }] },
      { q: "Which is the better buy: 12 oz for $3.00 or 18 oz for $4.05? Show the unit prices.", a: "$0.25/oz vs $0.225/oz → 18 oz is better", ccss: "6.RP.A.3b", dok: 2, type: "application", skill: "compare unit rates (best buy)", mode: "Paper", digital: false, misses: [{ answer: "12 oz", misconception: "doesn't convert to a common unit before comparing" }] },
      { q: "To find dollars-per-pound from '$6 for 3 lb', a student did 3 ÷ 6. Explain; give the right rate.", a: "Should be 6 ÷ 3 = $2/lb", ccss: "6.RP.A.3b", dok: 2, type: "error-analysis", skill: "diagnose inverted rate", mode: "Paper", digital: false, misses: [{ answer: "$0.50/lb", misconception: "inverts the unit rate (wrong quantity per 1)" }] },
      { q: "Abbie 🐾 eats 4 cups of food in 2 days. At that rate, how many cups in 5 days?", a: "10 cups", ccss: "6.RP.A.3b", dok: 2, type: "application", skill: "apply a unit rate", mode: "Paper", digital: false, misses: [{ answer: "2.5", misconception: "inverts the unit rate (wrong quantity per 1)" }] },
      { q: "Two runners: 6 mi in 48 min vs 4 mi in 36 min. Who is faster? Show min-per-mile.", a: "8 min/mi vs 9 min/mi → first runner faster", ccss: "6.RP.A.3b", dok: 3, type: "justify", skill: "reason with unit rates", mode: "Paper", digital: false, misses: [{ answer: "second runner", misconception: "doesn't convert to a common unit before comparing" }] },
      { q: "A printer prints 90 pages in 3 minutes. Pages per minute?", a: "30 pages/min", ccss: "6.RP.A.2", dok: 1, type: "fluency", skill: "unit rate", mode: "Digital OK", digital: true, misses: [{ answer: "0.033", misconception: "inverts the unit rate (wrong quantity per 1)" }] },
      { q: "$12 for 4 movie tickets. Cost per ticket, and cost for 7 tickets?", a: "$3 each; $21", ccss: "6.RP.A.3b", dok: 2, type: "application", skill: "unit rate then scale", mode: "Paper", digital: false, misses: [{ answer: "$0.33; $2.31", misconception: "inverts the unit rate (wrong quantity per 1)" }] },
    ],
  },
];

export const SBAC_MODULES = Array.from(new Set(SBAC_CHECKPOINTS.map((c) => c.module)));
export function checkpointsForLesson(lessonKey: string): Checkpoint[] {
  return SBAC_CHECKPOINTS.filter((c) => c.lessonKey === lessonKey);
}
export function getCheckpoint(id: string): Checkpoint | undefined {
  return SBAC_CHECKPOINTS.find((c) => c.id === id);
}
// Lenient answer check: trims, normalizes unicode minus and whitespace, numeric-aware.
export function gradeCheckpoint(input: string, correct: string): boolean {
  const norm = (s: string) => s.trim().replace(/−/g, '-').replace(/\s+/g, '').replace(/%$/, '').toLowerCase();
  const a = norm(input), b = norm(correct);
  if (!a) return false;
  const na = Number(a), nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  return a === b;
}
