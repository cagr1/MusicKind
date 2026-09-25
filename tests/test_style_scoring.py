import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from style_analyzer import cosine_similarity, fit_scaler, score_sections


class StyleScoringTests(unittest.TestCase):
    def test_large_scale_feature_does_not_dominate(self):
        refs = {"a": np.array([[0, 0], [2, 2000], [1, 1000], [3, 3000], [4, 4000]], float)}
        scores, best = score_sections(np.array([2, 2000]), refs)
        self.assertEqual(best, "a")
        self.assertEqual(scores["a"], 100.0)

    def test_centroid_is_100_and_far_input_is_zero(self):
        refs = {"a": np.array([[0.0], [1.0], [2.0], [3.0], [4.0]])}
        self.assertEqual(score_sections(np.array([2.0]), refs)[0]["a"], 100.0)
        self.assertEqual(score_sections(np.array([100.0]), refs)[0]["a"], 0.0)

    def test_separated_sections_choose_correct_best(self):
        refs = {"low": np.arange(5, dtype=float)[:, None], "high": np.arange(100, 105, dtype=float)[:, None],
                "mid": np.arange(50, 55, dtype=float)[:, None]}
        scores, best = score_sections(np.array([102.0]), refs)
        self.assertEqual(best, "high")
        self.assertGreater(scores["high"], scores["low"])

    def test_small_section_uses_pooled_distribution(self):
        small = np.array([[0.0], [1.0]])
        large = np.arange(10, dtype=float)[:, None] + 10
        scores, _ = score_sections(np.array([0.5]), {"small": small, "large": large})
        pooled = np.concatenate([small, large])
        mean, sd = fit_scaler(pooled)
        z = (pooled - mean) / sd
        center = z[:2].mean(axis=0)
        expected = round(float(np.mean(np.linalg.norm(z - center, axis=1) >= np.linalg.norm((np.array([0.5]) - mean) / sd - center))) * 100, 1)
        self.assertEqual(scores["small"], expected)

    def test_constant_feature_does_not_divide_by_zero(self):
        mean, sd = fit_scaler(np.array([[1.0, 4.0], [2.0, 4.0]]))
        self.assertEqual(sd[1], 1.0)
        self.assertTrue(np.isfinite((np.array([1.5, 4.0]) - mean) / sd).all())

    def test_old_cosine_helper_remains_available(self):
        self.assertAlmostEqual(cosine_similarity(np.array([1.0, 0.0]), np.array([1.0, 0.0])), 1.0)


if __name__ == "__main__":
    unittest.main()
