// ruleEngine.js
export function ruleEngine(ph, moisture, temperature) {
  let recommendations = [];

  // Check soil pH
  if (ph < 6) {
    recommendations.push("Soil is acidic. Add lime to balance pH.");
  } else if (ph > 8) {
    recommendations.push("Soil is alkaline. Add sulfur or organic compost.");
  } else {
    recommendations.push("Soil pH is optimal for most crops.");
  }

  // Check soil moisture
  if (moisture < 30) {
    recommendations.push("Soil is too dry. Irrigation is recommended.");
  } else if (moisture > 70) {
    recommendations.push("Soil is waterlogged. Improve drainage.");
  } else {
    recommendations.push("Soil moisture is within a good range.");
  }

  // Check temperature (if provided)
  if (temperature) {
    if (temperature < 15) {
      recommendations.push("Temperature is low. Consider frost protection.");
    } else if (temperature > 35) {
      recommendations.push("Temperature is high. Shade crops or increase irrigation.");
    } else {
      recommendations.push("Temperature is favorable for most crops.");
    }
  }

  return recommendations;
}
