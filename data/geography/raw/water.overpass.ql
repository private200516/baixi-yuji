[out:json][timeout:55];area(3603199272)->.county;(way["waterway"~"^(river|stream|canal)$"](area.county);way["natural"="water"](area.county);relation["natural"="water"](area.county););out geom;
