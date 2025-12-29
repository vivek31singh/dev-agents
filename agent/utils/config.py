import dspy
from .settings import settings

class DSPyConfig:
    def __init__(self):
        # Configuration is now centrally managed in settings.py with standardized names
        model_name = settings.lm_model
        api_key = settings.lm_api_key
        api_base = settings.lm_api_base

        if not api_key:
            print("Warning: LM_API_KEY not found in settings/environment.")

        self.lm = dspy.LM(
            model_name,
            api_key=api_key,
            api_base=api_base,
        )
        
        dspy.configure(lm=self.lm)
        self.dspy = dspy

    def get_dspy(self):
        return self.dspy

# Singleton instance
dspy_config = DSPyConfig()
