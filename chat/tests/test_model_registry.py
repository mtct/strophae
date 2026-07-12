"""US3: DeepSeek 4 Flash is a selectable, provider-backed model option."""

from django.conf import settings
from django.test import TestCase


class ModelRegistryTests(TestCase):
    def test_deepseek_4_flash_is_offered(self) -> None:
        self.assertIn('DeepSeek 4 Flash', settings.OPENROUTER_MODELS)

    def test_deepseek_4_flash_maps_to_v4_flash_slug(self) -> None:
        self.assertEqual(
            settings.OPENROUTER_MODEL_SLUGS['DeepSeek 4 Flash'],
            'deepseek/deepseek-v4-flash')

    def test_every_offered_model_has_a_slug(self) -> None:
        """Registry completeness: model_slug never falls back to the raw label."""
        missing = [m for m in settings.OPENROUTER_MODELS
                   if m not in settings.OPENROUTER_MODEL_SLUGS]
        self.assertEqual(missing, [])
