// ==========================
// ruleEngine.js
// Progressive Rule Engine for AgroScan
// Basic → Advanced → Scientific Recommendations
// ==========================

export function ruleEngine(ph, moisture, temperature) {
  let recommendations = [];

  // ========================== 1. BASIC LEVEL ==========================
  // Simple guidance that anyone can understand

  // Soil pH
  if (ph < 6) recommendations.push("Soil is acidic. Add lime to balance pH.");
  else if (ph > 8) recommendations.push("Soil is alkaline. Add sulfur or compost.");
  else recommendations.push("Soil pH is good for most crops.");

  // Soil moisture
  if (moisture < 30) recommendations.push("Soil is dry. Irrigation is recommended.");
  else if (moisture > 70) recommendations.push("Soil is wet. Avoid overwatering.");
  else recommendations.push("Soil moisture is in a healthy range.");

  // Temperature
  if (temperature !== undefined) {
    if (temperature < 15) recommendations.push("Temperature is low. Frost protection may be needed.");
    else if (temperature > 35) recommendations.push("Temperature is high. Provide shade or extra water.");
    else recommendations.push("Temperature is suitable for most crops.");
  }

  // ========================== 2. ADVANCED LEVEL ==========================
  // More practical actions for experienced farmers

  // Soil pH advanced
  if (ph < 5.5) recommendations.push("Very acidic soil. Apply lime generously, monitor crop growth.");
  else if (ph > 8.5) recommendations.push("Strongly alkaline soil. Consider gypsum or acidifying organic matter.");

  // Soil moisture advanced
  if (moisture < 20) recommendations.push("Extremely dry soil. Use mulching and drip irrigation to conserve water.");
  else if (moisture > 80) recommendations.push("Excess water can cause root rot. Improve drainage or raised beds.");

  // Temperature advanced
  if (temperature < 10) recommendations.push("Severe cold stress. Use row covers or greenhouses for sensitive crops.");
  else if (temperature > 40) recommendations.push("Heat stress likely. Use shade nets and frequent irrigation.");

  // ========================== 3. SCIENTIFIC LEVEL ==========================
  // Detailed technical insights for agronomists or researchers

  // Nutrient availability
  if (ph < 6 || ph > 8) recommendations.push("Nutrient availability may be limited. Conduct soil NPK test.");

  // Pest/disease risk
  if ((moisture > 70 && temperature > 30) || (temperature > 35)) {
    recommendations.push("High humidity and heat can increase pest/fungal disease risk. Monitor closely and consider IPM strategies.");
  }

  // Crop-specific tips (example for common crops)
  if (ph >= 6 && ph <= 7.5 && moisture >= 30 && moisture <= 70) {
    recommendations.push("Conditions are optimal for crops like wheat, rice, maize, and vegetables.");
  }

  return recommendations;
}
