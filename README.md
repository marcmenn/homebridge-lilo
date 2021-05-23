# homebridge-lilo
Homebridge plugin for lilo indoor garden

My beloved lilo garden suddenly stopped scheduling. So I decided to work around this issue and integrate the BLE garden in homekit with a homebridge plugin.

## Status

After adding this plugin as a platoform to your homebridge, it scans your BLE for gardens on homebridge boot (~5min) and exposes them as simple lightbulbs that can be switched.

I integrated mine in homekit scenes and automations to do the switching.
