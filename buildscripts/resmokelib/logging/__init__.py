"""
Extension to the logging package to support buildlogger.
"""

from __future__ import absolute_import

from . import config
from . import buildlogger
from . import flush
from . import loggers

from .loggers import LoggerAdapter as Logger
