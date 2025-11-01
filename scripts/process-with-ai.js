// scripts/process-with-ai.js - КАЧЕСТВЕННАЯ AI ОБРАБОТКА
const { OpenAI } = require('openai');
const fs = require('fs').promises;
const path = require('path');
const ExcelJS = require('exceljs');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const AI_MODEL = "gpt-3.5-turbo";

console.log('🚀 Запускаем КАЧЕСТВЕННУЮ AI обработку...');

async function processArticles() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.log('❌ OpenAI API ключ не найден!');
      return;
    }

    const inputPath = path.join(__dirname, '../results/Статьи Дзен/Нарочно не придумаешь/Нарочно не придумаешь_articles.xlsx');
    
    console.log('📁 Проверяем файл со статьями...');
    await fs.access(inputPath);
    console.log('✅ Файл со статьей найден!');

    // Читаем Excel файл
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(inputPath);
    const worksheet = workbook.getWorksheet('Articles');
    const totalArticles = worksheet.rowCount - 1;
    console.log(`📊 Найдено статей: ${totalArticles}`);

    // Создаем папку для результатов
    const outputDir = path.join(__dirname, '../processed');
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'качественные_статьи.xlsx');
    
    const newWorkbook = new ExcelJS.Workbook();
    const newWorksheet = newWorkbook.addWorksheet('Качественные статьи');

    // Столбцы с полным текстом
    newWorksheet.columns = [
      { header: '№', key: 'number', width: 5 },
      { header: 'Оригинальный заголовок', key: 'original_title', width: 35 },
      { header: 'Уникальный заголовок', key: 'unique_title', width: 35 },
      { header: 'Оригинальный текст', key: 'original_text', width: 80 },
      { header: 'Уникальный текст', key: 'unique_text', width: 80 },
      { header: 'Ориг. слов', key: 'original_words', width: 12 },
      { header: 'Уник. слов', key: 'unique_words', width: 12 },
      { header: 'Разница', key: 'difference', width: 15 },
      { header: 'Статус', key: 'status', width: 20 }
    ];

    // Обрабатываем 1 статью для теста
    let processedCount = 0;
    const maxArticles = 1;

    for (let i = 2; i <= Math.min(worksheet.rowCount, maxArticles + 1); i++) {
      const row = worksheet.getRow(i);
      const originalTitle = row.getCell(1).value;
      const originalText = row.getCell(2).value;
      
      if (!originalTitle || !originalText) continue;

      const originalWordCount = originalText.split(/\s+/).length;
      console.log(`\n🔍 Обрабатываем: "${originalTitle.substring(0, 50)}..."`);
      console.log(`   📊 Оригинальный объем: ${originalWordCount} слов`);

      try {
                // УЛУЧШЕННЫЙ ПРОМПТ ДЛЯ КАЧЕСТВЕННОЙ ОБРАБОТКИ
        const qualityPrompt = `
ПЕРЕПИШИ ЭТУ СТАТЬЮ ПОЛНОСТЬЮ, СОХРАНИВ ОСНОВНОЙ СМЫСЛ И ОБЪЕМ.

ТРЕБОВАНИЯ:
1. Сохрани ОСНОВНУЮ ИСТОРИЮ и главную идею
2. Сохрани примерно ТОТ ЖЕ ОБЪЕМ текста (${originalWordCount} слов ±15%)
3. ИЗМЕНИ: имена героев, диалоги, детали, локации
4. Сделай текст УНИКАЛЬНЫМ, но ЕСТЕСТВЕННЫМ
5. Заголовок должен отражать суть, но быть другим

ВАЖНО: Верни ПОЛНЫЙ ТЕКСТ статьи, а не только начало!

ОРИГИНАЛЬНЫЙ ЗАГОЛОВОК: "${originalTitle}"

ОРИГИНАЛЬНЫЙ ТЕКСТ:
"${originalText}"

ВЕРНИ ОТВЕТ В ФОРМАТЕ:
ЗАГОЛОВОК: [твой новый заголовок]
ТЕКСТ: [полный переписанный текст статьи]
`;

        console.log('   ✍️ Создаем качественный уникальный контент...');
        
        const response = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: qualityPrompt }],
          max_tokens: 4000,
          temperature: 0.8
        });

        const result = response.choices[0].message.content;
        
        // Парсим результат
        const uniqueTitle = extractValue(result, 'ЗАГОЛОВОК');
        const uniqueText = extractValue(result, 'ТЕКСТ');
        const uniqueWordCount = uniqueText.split(/\s+/).length;
        
        const diffPercent = Math.round((uniqueWordCount - originalWordCount) / originalWordCount * 100);
        const volumeStatus = Math.abs(diffPercent) <= 15 ? '✅ Сохранен' : `⚠️ ${diffPercent}%`;

        console.log(`   📊 Результат: ${originalWordCount} → ${uniqueWordCount} слов (${volumeStatus})`);
        console.log(`   🎯 Новый заголовок: ${uniqueTitle}`);

        // Добавляем в таблицу
        newWorksheet.addRow({
          number: i - 1,
          original_title: originalTitle,
          unique_title: uniqueTitle,
          original_text: originalText.substring(0, 1500) + (originalText.length > 1500 ? '...' : ''),
          unique_text: uniqueText,
          original_words: originalWordCount,
          unique_words: uniqueWordCount,
          difference: volumeStatus,
          status: '✅ Успешно'
        });

        processedCount++;
        console.log(`   ✅ Успешно! Создан уникальный контент.`);

        // Пауза между запросами
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.log(`   ❌ Ошибка: ${error.message}`);
      }
    }

    // Сохраняем результаты
    await newWorkbook.xlsx.writeFile(outputPath);
    
    console.log('\n🎉 ====== РЕЗУЛЬТАТЫ КАЧЕСТВЕННОЙ ОБРАБОТКИ ======');
    console.log(`📊 Обработано статей: ${processedCount}`);
    console.log(`📁 Файл: ${outputPath}`);

  } catch (error) {
    console.error('💥 Критическая ошибка:', error.message);
  }
}

// Вспомогательная функция
function extractValue(text, key) {
  const regex = new RegExp(`${key}:\\s*([^\\n]+)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : 'не определено';
}

// Запускаем обработку
processArticles();