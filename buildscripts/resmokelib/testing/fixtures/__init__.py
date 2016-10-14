"""
Fixtures for executing JSTests against.
"""

from __future__ import absolute_import

from .interface import Fixture, ReplFixture
from .standalone import MongoDFixture
from .replicaset import ReplicaSetFixture
from .masterslave import MasterSlaveFixture
from .shardedcluster import ShardedClusterFixture


NOOP_FIXTURE_CLASS = "Fixture"

_FIXTURES = {
    "Fixture": Fixture,
    "MongoDFixture": MongoDFixture,
    "ReplicaSetFixture": ReplicaSetFixture,
    "MasterSlaveFixture": MasterSlaveFixture,
    "ShardedClusterFixture": ShardedClusterFixture,
}


def short_name_for_fixture(class_name):
    """
    Returns a shortened name of the fixture, to be used as the name of the logger for that fixture.
    """
    return _FIXTURES[class_name].SHORT_NAME


def make_fixture(class_name, *args, **kwargs):
    """
    Factory function for creating Fixture instances.
    """

    if class_name not in _FIXTURES:
        raise ValueError("Unknown fixture class '%s'" % (class_name))
    return _FIXTURES[class_name](*args, **kwargs)
