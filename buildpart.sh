#!/bin/bash
###############################################################################
# Clue Configuration Manager
#
# Build Bridge package. These partcipular actions have to run after standard
# build process, just to prepare the whole package for creating debian module
#
# $Id: build-prep.sh 966 2017-02-13 22:54:04Z stefan $
###############################################################################

OLDVER=$(getPrevVersion "${MODPATH}/deb/control")
NEWVER=$(getCurrentVersion "${MODPATH}/deb/control")
sed -i "s/$OLDVER/$NEWVER/g" ${SRCDIR}/package.json
mkdir -p ${BUILDPATH}/${MOD}/opt/clue/share/bridge
cp -rf ${SRCDIR}/* ${BUILDPATH}/${MOD}/opt/clue/share/bridge/
