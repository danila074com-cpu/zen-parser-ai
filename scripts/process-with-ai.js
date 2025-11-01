// scripts/process-with-ai.js — версия под GPT-4o (MadeSimple style)
const { OpenAI } = require('openai');
const fs = require('fs').promises;
const path = require('path');
const ExcelJS = require('exceljs');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 🚀 Используем GPT-4o — точный, стильный, быстро работает
const AI_MODEL = "gpt-4o";

console.log('🚀 Запускаем AI-обработку статей (GPT-4o)...');

async function processArticles() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.log('❌ Не найден ключ OpenAI API!');
      return;
    }

    const inputPath = path.join(__dirname, '../results/Статьи Дзен/Нарочно не придумаешь/Нарочно не придумаешь_articles.xlsx');
    console.log('📁 Проверяем входной файл...');
    await fs.access(inputPath);
    console.log('✅ Файл найден!');

    // Читаем Excel с оригиналами
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(inputPath);
    const worksheet = workbook.getWorksheet('Articles');
    const totalArticles = worksheet.rowCount - 1;
    console.log(`📊 Найдено статей: ${totalArticles}`);

    // Создаём папку для результатов
    const outputDir = path.join(__dirname, '../processed');
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'рабочие_статьи_GPT4o.xlsx');

    const newWorkbook = new ExcelJS.Workbook();
    const newWorksheet = newWorkbook.addWorksheet('Рабочие статьи');

    // Настраиваем столбцы
    newWorksheet.columns = [
      { header: '№', key: 'number', width: 5 },
      { header: 'Оригинальный заголовок', key: 'original_title', width: 35 },
      { header: 'Уникальный заголовок', key: 'unique_title', width: 35 },
      { header: 'Оригинальный текст', key: 'original_text', width: 80 },
      { header: 'Уникальный текст', key: 'unique_text', width: 80 },
      { header: 'Ориг. слов', key: 'original_words', width: 12 },
      { header: 'Уник. слов', key: 'unique_words', width: 12 },
      { header: 'Разница', key: 'difference', width: 12 },
      { header: 'Статус', key: 'status', width: 20 }
    ];

    // Сколько статей обработать за запуск
    const maxArticles = 4;
    let processedCount = 0;

    for (let i = 2; i <= Math.min(worksheet.rowCount, maxArticles + 1); i++) {
      const row = worksheet.getRow(i);
      const originalTitle = row.getCell(1).value;
      const originalText = row.getCell(2).value;

      if (!originalTitle || !originalText) continue;

      const originalWordCount = originalText.split(/\s+/).length;
      console.log(`\n🔍 Обрабатываем статью: "${originalTitle.substring(0, 50)}..."`);
      console.log(`   📏 Объём оригинала: ${originalWordCount} слов`);

      try {
        // === 1. Новый уникальный заголовок в том же стиле ===
console.log('   💡 Генерируем новый заголовок в том же стиле...');

const titlePrompt = `
Ты — копирайтер, работающий в стиле канала "MadeSimple" (Яндекс Дзен).
Твоя задача — придумать НОВЫЙ заголовок, который звучит точно в том же ритме и эмоциональном стиле, что и оригинальный.
Не меняй тип интонации (если в оригинале прямое высказывание — оставь прямое; если интрига — оставь интригу).
Можно заменить участников, детали и место действия, но структура и настроение должны оставаться такими же.
Не используй западные имена, "Смитов", или темы вроде бизнеса, мотивации, успеха.
Примеры верной трансформации:
— "Муж ушёл, а я даже не плакала" → "Сын уехал, а я даже не проводила"
— "Я простила свекровь, но больше к ней не поехала" → "Я приняла сестру мужа, но в гости не зову"
— "После 50 я поняла, что устала быть удобной" → "После 40 я поняла, что больше никому ничего не должна"

Оригинальный заголовок:
"${originalTitle}"

Верни только новый заголовок без кавычек.
`;

const titleResponse = await openai.chat.completions.create({
  model: AI_MODEL,
  messages: [{ role: "user", content: titlePrompt }],
  temperature: 0.9,
  max_tokens: 120
});

const uniqueTitle = titleResponse.choices[0].message.content
  .replace(/["']/g, '')
  .trim();
        // === 2. Переписываем текст в том же стиле ===
        console.log('   ✍️ Переписываем текст с сохранением сюжета...');

        const textPrompt = `
Ты — опытный копирайтер и редактор в духе канала "MadeSimple" (Яндекс Дзен).
Перепиши полностью этот рассказ, сохранив сюжет, последовательность сцен и эмоции.
Измени имена, диалоги и детали, но не смысл.
Не превращай историю в "мотивационную речь" или "американскую историю успеха".
Оставь русскую атмосферу, бытовые реалии, живые диалоги и внутренние переживания героини.
Пиши естественно, как будто текст предназначен для Дзена.
Объем примерно ${originalWordCount} слов.

Оригинальный текст:
"""${originalText}"""

Верни только готовый текст без комментариев и заголовков.
`;

        const textResponse = await openai.chat.completions.create({
          model: AI_MODEL,
          messages: [{ role: "user", content: textPrompt }],
          temperature: 0.8,
          max_tokens: 7000
        });

        const uniqueText = textResponse.choices[0].message.content.trim();
        const uniqueWordCount = uniqueText.split(/\s+/).length;
        const diffPercent = Math.round((uniqueWordCount - originalWordCount) / originalWordCount * 100);
        const volumeStatus = Math.abs(diffPercent) <= 15 ? '✅ Сохранен' : `⚠️ ${diffPercent}%`;

        console.log(`   📊 Итог: ${originalWordCount} → ${uniqueWordCount} слов (${volumeStatus})`);
        console.log(`   📝 Новый заголовок: ${uniqueTitle}`);

        // === 3. Записываем в Excel и .txt ===
        newWorksheet.addRow({
          number: i - 1,
          original_title: originalTitle,
          unique_title: uniqueTitle,
          original_text: originalText,
          unique_text: uniqueText,
          original_words: originalWordCount,
          unique_words: uniqueWordCount,
          difference: volumeStatus,
          status: '✅ Готово'
        });

        // Сохраняем .txt версию
        const safeTitle = uniqueTitle.replace(/[\\/:*?"<>|]/g, '');
        await fs.writeFile(path.join(outputDir, `${i - 1}_${safeTitle}.txt`), uniqueText, 'utf8');

        processedCount++;
        console.log('   ✅ Статья успешно обработана.');

        // Пауза для стабильности API
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.log(`   ❌ Ошибка: ${error.message}`);
      }
    }

    // === Сохраняем результат ===
    await newWorkbook.xlsx.writeFile(outputPath);
    console.log('\n🎉 ====== ГОТОВО ======');
    console.log(`📊 Обработано статей: ${processedCount}`);
    console.log(`📁 Файл: ${outputPath}`);

  } catch (error) {
    console.error('💥 Критическая ошибка:', error.message);
  }
}

processArticles();
