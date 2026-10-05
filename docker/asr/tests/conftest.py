"""The service modules live one folder up (docker/asr); the tests need only numpy and pytest."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
