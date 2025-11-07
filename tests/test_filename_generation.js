/**
 * test_filename_generation.js - Tests pour generateOutputFilename
 *
 * Valide que les noms de fichiers sont correctement formatés avec codec et tag
 * Lancer avec : node tests/test_filename_generation.js
 */

const { generateOutputFilename } = require("../backend/utils");

console.log("🧪 Tests de génération de noms de fichiers\n");

const tests = [
  {
    input: "Movie.Title.2024.mkv",
    codec: "HEVC",
    tag: "Z3D",
    expected: "Movie.Title.2024.h265.Z3D.mkv",
    description: "Ajout h265 et tag sur fichier sans format",
  },
  {
    input: "Movie.Title.2024.mkv",
    codec: "VP9",
    tag: "Z3D",
    expected: "Movie.Title.2024.vp9.Z3D.mkv",
    description: "Ajout vp9 et tag sur fichier sans format",
  },
  {
    input: "Movie.Title.2024.h265.mkv",
    codec: "HEVC",
    tag: "Z3D",
    expected: "Movie.Title.2024.h265.Z3D.mkv",
    description: "Ajout tag sur fichier avec h265 existant",
  },
  {
    input: "Movie.Title.2024.Z3D.mkv",
    codec: "HEVC",
    tag: "Z3D",
    expected: "Movie.Title.2024.h265.Z3D.mkv",
    description: "Insertion h265 avant tag existant",
  },
  {
    input: "Movie.Title.2024.h265.Z3D.mkv",
    codec: "HEVC",
    tag: "Z3D",
    expected: "Movie.Title.2024.h265.Z3D.mkv",
    description: "Fichier déjà correct (h265 + tag)",
  },
  {
    input: "Movie.Title.2024.vp9.Z3D.mkv",
    codec: "VP9",
    tag: "Z3D",
    expected: "Movie.Title.2024.vp9.Z3D.mkv",
    description: "Fichier déjà correct (vp9 + tag)",
  },
  {
    input: "Movie.Title.2024.h265.mkv",
    codec: "VP9",
    tag: "Z3D",
    expected: "Movie.Title.2024.vp9.Z3D.mkv",
    description: "Remplacement h265 par vp9 + ajout tag",
  },
  {
    input: "Movie.Title.2024.vp9.mkv",
    codec: "HEVC",
    tag: "Z3D",
    expected: "Movie.Title.2024.h265.Z3D.mkv",
    description: "Remplacement vp9 par h265 + ajout tag",
  },
  {
    input: "Movie.Title.2024.x265.RARBG.mkv",
    codec: "HEVC",
    tag: "Z3D",
    expected: "Movie.Title.2024.h265.RARBG.Z3D.mkv",
    description: "Remplacement x265 par h265, conservation ancien tag RARBG",
  },
  {
    input: "Series.S01E01.1080p.WEB-DL.mkv",
    codec: "HEVC",
    tag: "Z3D",
    expected: "Series.S01E01.1080p.WEB-DL.h265.Z3D.mkv",
    description: "Série - ajout h265 et tag",
  },
  {
    input: "Movie.2024.HEVC.HDR.mkv",
    codec: "HEVC",
    tag: "Z3D",
    expected: "Movie.2024.h265.HDR.Z3D.mkv",
    description: "Remplacement HEVC par h265 standard, conservation HDR",
  },
  {
    input: "Movie.2024.1080p.mp4",
    codec: "VP9",
    tag: "SHARK",
    expected: "Movie.2024.1080p.vp9.SHARK.mp4",
    description: "Tag personnalisé SHARK avec VP9",
  },
];

let passed = 0;
let failed = 0;

console.log("📋 Exécution des tests...\n");

tests.forEach((test, index) => {
  const result = generateOutputFilename(test.input, test.codec, test.tag);
  const success = result === test.expected;

  if (success) {
    console.log(`✅ Test ${index + 1}: ${test.description}`);
    console.log(`   Input:    ${test.input}`);
    console.log(`   Output:   ${result}`);
    console.log(`   Codec:    ${test.codec}, Tag: ${test.tag}\n`);
    passed++;
  } else {
    console.log(`❌ Test ${index + 1}: ${test.description}`);
    console.log(`   Input:    ${test.input}`);
    console.log(`   Expected: ${test.expected}`);
    console.log(`   Got:      ${result}`);
    console.log(`   Codec:    ${test.codec}, Tag: ${test.tag}\n`);
    failed++;
  }
});

// Résumé
console.log("=".repeat(60));
if (failed === 0) {
  console.log(`✅ TOUS LES TESTS SONT PASSÉS (${passed}/${tests.length})`);
} else {
  console.log(`❌ ${failed} TEST(S) ÉCHOUÉ(S) sur ${tests.length}`);
  console.log(`✅ ${passed} test(s) réussi(s)`);
}
console.log("=".repeat(60));

console.log("\n📝 Résumé:");
console.log("  - Détection formats: h265, x265, hevc, vp9");
console.log("  - Insertion codec avant tag si manquant");
console.log("  - Remplacement codec si changement HEVC ↔ VP9");
console.log("  - Préservation du nom original");
console.log("  - Support tags personnalisés");

if (failed === 0) {
  console.log("\n🎉 Fonction generateOutputFilename validée!");
  process.exit(0);
} else {
  console.log("\n⚠️  Corrections nécessaires");
  process.exit(1);
}
