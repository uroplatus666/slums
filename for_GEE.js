// Google Earth Engine script: для каждого города (New Delhi, Mumbai, Bengaluru)
// формируем медианные композиции Sentinel-2, вычисляем NDVI и NDBI, а также медианные VIIRS Night‐Lights.

// ---------------------------------------------
// 1. Определяем границы (примерно) трёх городов
// ---------------------------------------------
// Для примера используем центральные точки с буфером 30 км.
// При наличии точных полигональных границ загрузите их как Assets и используйте вместо точек.

var cities = {
  'NewDelhi':    ee.Geometry.Point([77.2090, 28.6139]).buffer(40000),
  'Mumbai':      ee.Geometry.Point([72.8777, 19.0760]).buffer(60000),
  'Bengaluru':   ee.Geometry.Point([77.5946, 12.9716]).buffer(40000)
};

// Визуализируем области на карте
Map.centerObject(cities['NewDelhi'], 8);
Map.addLayer(cities['NewDelhi'],   {color: 'FF0000'}, 'New Delhi Region');
Map.addLayer(cities['Mumbai'],     {color: '0000FF'}, 'Mumbai Region');
Map.addLayer(cities['Bengaluru'],  {color: '00FF00'}, 'Bengaluru Region');

// ---------------------------------------------
// 2. Функции для маскировки и вычислений
// ---------------------------------------------
// 2.1. Маскирование облаков в Sentinel-2 SR (L2A) через SCL
function maskS2SR(image) {
  var scl = image.select('SCL');
  // Маскируем пиксели облаков (SCL == 3, 8, 9, 10) и снежных (SCL == 2, 11)
  var mask = scl.neq(3).and(scl.neq(8))
                .and(scl.neq(9)).and(scl.neq(10))
                .and(scl.neq(2)).and(scl.neq(11));
  return image
    .select(['B2','B3','B4','B8','B11','SCL'])
    .updateMask(mask)
    .divide(10000);
}

// 2.2. Функция создания медианного composite Sentinel-2 за указанный период и региона
function getS2Composite(region, startDate, endDate) {
  var collection = ee.ImageCollection('COPERNICUS/S2_SR')
    .filterDate(startDate, endDate)
    .filterBounds(region)
    .map(maskS2SR);
  return collection.median().clip(region);
}

// 2.3. Вычисление NDVI из composite
function computeNDVI(s2Image) {
  return s2Image.expression(
    '(NIR - RED) / (NIR + RED)', {
      'NIR': s2Image.select('B8'),
      'RED': s2Image.select('B4')
    }).rename('NDVI');
}

// 2.4. Вычисление NDBI из composite
function computeNDBI(s2Image) {
  return s2Image.expression(
    '(SWIR - NIR) / (SWIR + NIR)', {
      'SWIR': s2Image.select('B11'),
      'NIR':  s2Image.select('B8')
    }).rename('NDBI');
}

// 2.5. Функция для медианного VIIRS Night‐Lights за период и региона
function getVIIRSMedian(region, startDate, endDate) {
  var viirs = ee.ImageCollection('NOAA/VIIRS/DNB/MONTHLY_V1/VCMCFG')
    .filterDate(startDate, endDate)
    .filterBounds(region)
    .select('avg_rad');
  return viirs.median().clip(region).rename('NightLights');
}

// ---------------------------------------------
// 3. Основной блок: для каждого города вычисляем индексы
// ---------------------------------------------
var startDate = '2024-06-01';
var endDate   = '2025-06-01';

// Проходим по ключам в объекте cities
Object.keys(cities).forEach(function(cityName) {
  var regionGeom = cities[cityName];
  
  // 3.1. Sentinel-2 composite
  var s2Composite = getS2Composite(regionGeom, startDate, endDate);
  
  // 3.2. NDVI и NDBI
  var ndvi = computeNDVI(s2Composite).clip(regionGeom);
  var ndbi = computeNDBI(s2Composite).clip(regionGeom);
  
  // 3.3. VIIRS Night‐Lights
  var nightLights = getVIIRSMedian(regionGeom, startDate, endDate);
  
  // 3.4. Визуализация на карте
  // RGB-слой S2
  Map.addLayer(
    s2Composite.select(['B4','B3','B2']),
    {min: 0, max: 0.3},
    cityName + ' Sentinel-2 RGB'
  );
  // NDVI
  Map.addLayer(
    ndvi,
    {min: 0, max: 1, palette: ['ffffff','006400']},
    cityName + ' NDVI'
  );
  // NDBI
  Map.addLayer(
    ndbi,
    {min: -1, max: 1, palette: ['f2f0f7','cbc9e2','9e9ac8','6a51a3']},
    cityName + ' NDBI'
  );
  // VIIRS Night-Lights
  Map.addLayer(
    nightLights,
    {min: 0, max: 60, palette: ['000000','ffffe5','ffcc00','ff0000']},
    cityName + ' NightLights'
  );
  
  // 3.5. Экспорт растров (опционально)
  // NDVI
  Export.image.toDrive({
    image: ndvi,
    description: cityName + '_NDVI',
    folder: 'GEE_Exports',
    fileNamePrefix: cityName + '_NDVI_2024_2025',
    region: regionGeom,
    scale: 10,
    crs: 'EPSG:4326',
    maxPixels: 1e13
  });
  
  // NDBI
  Export.image.toDrive({
    image: ndbi,
    description: cityName + '_NDBI',
    folder: 'GEE_Exports',
    fileNamePrefix: cityName + '_NDBI_2024_2025',
    region: regionGeom,
    scale: 10,
    crs: 'EPSG:4326',
    maxPixels: 1e13
  });
  
  // VIIRS NightLights
  Export.image.toDrive({
    image: nightLights,
    description: cityName + '_NightLights',
    folder: 'GEE_Exports',
    fileNamePrefix: cityName + '_NightLights_2024_2025',
    region: regionGeom,
    scale: 10,
    crs: 'EPSG:4326',
    maxPixels: 1e13
  });
});
