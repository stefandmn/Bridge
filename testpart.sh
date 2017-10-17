#!/bin/bash
###############################################################################
# Clue Configuration Manager
#
# Test Bridge package. These partcipular actions have to run in between standard
# tests process, just to deploy the whole resources for a consistent test
#
# $Id: test-prep.sh 966 2017-02-13 22:54:04Z stefan $
###############################################################################

/usr/bin/ssh $REMOTEUSER@$REMOTEHOST "mkdir -p /opt/clue/share/bridge"

/usr/bin/scp -r ${SRCDIR}/* $REMOTEUSER@$REMOTEHOST:/opt/clue/share/bridge/
/usr/bin/scp -r ${SYSDIR}/* $REMOTEUSER@$REMOTEHOST:/
