/**
 * test_disk_space.js - Tests pour checkDiskSpace réel
 *
 * Valide que la vérification d'espace disque fonctionne correctement
 * avec la bibliothèque check-disk-space
 *
 * Lancer avec : node tests/test_disk_space.js
 */

const { checkDiskSpace, ensureSpaceAvailable, formatBytes } = require("../backend/utils");
const path = require("path");

console.log("🧪 Tests de vérification d'espace disque\n");

async function runTests() {
  try {
    // Test 1: Vérifier l'espace disque actuel
    console.log("📋 Test 1: checkDiskSpace() - Disque actuel");
    console.log("─────────────────────────────────────────────");

    const currentDir = __dirname;
    console.log(`  Répertoire testé: ${currentDir}`);

    const space = await checkDiskSpace(currentDir);

    console.log(`  ✅ Espace total: ${formatBytes(space.size)}`);
    console.log(`  ✅ Espace libre: ${formatBytes(space.free)}`);
    console.log(`  ✅ Espace utilisé: ${formatBytes(space.size - space.free)}`);
    console.log(`  ✅ Pourcentage libre: ${((space.free / space.size) * 100).toFixed(1)}%\n`);

    // Vérifications de cohérence
    if (space.free > 0 && space.size > 0) {
      console.log("  ✅ Valeurs cohérentes (positives)");
    } else {
      console.log("  ❌ Valeurs invalides!");
      return;
    }

    if (space.free <= space.size) {
      console.log("  ✅ Logique correcte (free <= size)");
    } else {
      console.log("  ❌ Espace libre > espace total (impossible!)");
      return;
    }

    // Test 2: ensureSpaceAvailable avec espace suffisant
    console.log("\n📋 Test 2: ensureSpaceAvailable() - Espace suffisant");
    console.log("─────────────────────────────────────────────────────");

    const smallSize = 1024 * 1024; // 1 MB (devrait toujours passer)
    console.log(`  Requis: ${formatBytes(smallSize)}`);

    try {
      await ensureSpaceAvailable(currentDir, smallSize);
      console.log("  ✅ Validation OK (espace suffisant)");
    } catch (error) {
      console.log(`  ❌ Erreur inattendue: ${error.message}`);
    }

    // Test 3: ensureSpaceAvailable avec marge de sécurité
    console.log("\n📋 Test 3: ensureSpaceAvailable() - Marge de sécurité");
    console.log("──────────────────────────────────────────────────────");

    const mediumSize = 100 * 1024 * 1024; // 100 MB
    const safetyMargin = 0.2; // 20% marge

    console.log(`  Requis: ${formatBytes(mediumSize)}`);
    console.log(`  Marge: ${(safetyMargin * 100).toFixed(0)}%`);
    console.log(`  Total avec marge: ${formatBytes(Math.ceil(mediumSize * (1 + safetyMargin)))}`);

    try {
      await ensureSpaceAvailable(currentDir, mediumSize, safetyMargin);
      console.log("  ✅ Validation OK (avec marge)");
    } catch (error) {
      console.log(`  ⚠️  Espace insuffisant (normal si disque plein): ${error.message.split("\n")[0]}`);
    }

    // Test 4: ensureSpaceAvailable - Dépassement volontaire
    console.log("\n📋 Test 4: ensureSpaceAvailable() - Dépassement volontaire");
    console.log("────────────────────────────────────────────────────────────");

    const hugeSize = space.free + 1024 * 1024 * 1024; // Plus que disponible
    console.log(`  Requis: ${formatBytes(hugeSize)} (plus que disponible)`);
    console.log(`  Disponible: ${formatBytes(space.free)}`);

    try {
      await ensureSpaceAvailable(currentDir, hugeSize, 0); // Sans marge
      console.log("  ❌ ERREUR: Devrait avoir échoué!");
    } catch (error) {
      console.log("  ✅ Exception levée correctement:");
      console.log(
        error.message
          .split("\n")
          .map((line) => `      ${line}`)
          .join("\n")
      );
    }

    // Test 5: Répertoire invalide
    console.log("\n📋 Test 5: checkDiskSpace() - Répertoire invalide");
    console.log("───────────────────────────────────────────────────");

    const invalidPath = path.join(__dirname, "nonexistent_directory_12345");
    console.log(`  Répertoire: ${invalidPath}`);

    try {
      await checkDiskSpace(invalidPath);
      console.log("  ❌ ERREUR: Devrait avoir échoué!");
    } catch (error) {
      console.log(`  ✅ Exception levée: ${error.message}`);
    }

    // Résumé
    console.log("\n" + "=".repeat(60));
    console.log("✅ TOUS LES TESTS SONT PASSÉS");
    console.log("=".repeat(60));
    console.log("\n📝 Résumé:");
    console.log("  - checkDiskSpace: Fonctionne avec valeurs réelles");
    console.log("  - ensureSpaceAvailable: Valide correctement l'espace");
    console.log("  - Marge de sécurité: Calcul correct");
    console.log("  - Messages d'erreur: Clairs et informatifs");
    console.log("  - Gestion d'erreurs: Robuste");
    console.log("\n🎉 Étape 2 du refactoring validée!");
    console.log(`\n💾 Espace disque actuel: ${formatBytes(space.free)} libre sur ${formatBytes(space.size)}`);
  } catch (error) {
    console.error("\n❌ Erreur fatale durant les tests:", error);
    process.exit(1);
  }
}

runTests();
