"""
Module to hold the logger instances themselves.
"""

from __future__ import absolute_import

import logging

from .. import utils

EXECUTOR_LOGGER_NAME = "executor"
FIXTURE_LOGGER_NAME = "fixture"
TESTS_LOGGER_NAME = "tests"


class LoggerAdapter(logging.Logger):
    """
    Based of the logging.LoggerAdapter class, but inherits from logging.Logger so that it can be
    used more transparently.

    Allows adding extra attributes to each log record, to be used in the formatter.
    """
    def __init__(self, logger_name, level=logging.NOTSET, extra=None):
        logging.Logger.__init__(self, logger_name, level)
        self.extra = utils.default_if_none(extra, {}).copy()

    def makeRecord(self, name, level, fn, lno, msg, args, exc_info, func=None, extra=None):
        """
        Adds attributes from 'self.extra' to the record.
        """
        record = logging.Logger.makeRecord(
            self, name, level, fn, lno, msg, args, exc_info, func, extra)
        for key in self.extra:
            record.__dict__[key] = self.extra[key]
        return record


def new_logger(logger_name, parent=None, extra=None):
    """
    Returns an instance of 'LoggerAdapter' with the given extra attributes, setting the parent of
    the logger if specified.
    """
    if parent is not None:
        inherited_extra = parent.extra.copy()
        inherited_extra.update(utils.default_if_none(extra, {}))
        extra = inherited_extra

    # Set up the logger to handle all messages it receives.
    logger = LoggerAdapter(logger_name, level=logging.DEBUG, extra=extra)

    if parent is not None:
        logger.parent = parent
        logger.propagate = True

    return logger

EXECUTOR = new_logger(EXECUTOR_LOGGER_NAME)
FIXTURE = new_logger(FIXTURE_LOGGER_NAME)
TESTS = new_logger(TESTS_LOGGER_NAME)

LOGGERS_BY_NAME = {
    EXECUTOR_LOGGER_NAME: EXECUTOR,
    FIXTURE_LOGGER_NAME: FIXTURE,
    TESTS_LOGGER_NAME: TESTS,
}

_BUILDLOGGER_FALLBACK = new_logger("fallback")
