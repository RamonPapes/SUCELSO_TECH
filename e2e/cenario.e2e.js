const { chromium } = require('playwright');
// Teste ponta a ponta no navegador (Playwright) do cenário obrigatório de validação.
// Pré-requisitos: banco recém-semeado, API em API_URL e frontend em WEB_URL.
//   cd e2e && npm install && npx playwright install chromium && npm test
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '..', 'docs', 'evidencias');
const URL = process.env.WEB_URL || 'http://localhost:5173';
const API_URL = process.env.API_URL || 'http://localhost:3001';
const SENHA = 'Sucelso@2026';
const erros = [];
let passo = 0;
const ok = (m) => console.log(`✔ ${++passo}. ${m}`);
function expect(cond, m) { if (!cond) throw new Error('FALHOU: ' + m); }

async function novaPagina(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, ...opts });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && erros.push(`[console] ${m.text()}`));
  page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
  page.on('response', (r) => r.status() >= 500 && erros.push(`[http ${r.status()}] ${r.url()}`));
  page.on('dialog', (d) => d.accept());
  return page;
}
async function login(page, email) {
  await page.goto(URL);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.locator('.topo').waitFor();
}
const shot = (page, nome, full = true) => page.screenshot({ path: `${OUT}/${nome}.png`, fullPage: full });

(async () => {
  const browser = await chromium.launch();

  // Login inválido
  let p = await novaPagina(browser);
  await p.goto(URL);
  await p.getByLabel('E-mail').fill('ana.souza@sucelso.tech');
  await p.getByLabel('Senha').fill('errada');
  await p.getByRole('button', { name: 'Entrar' }).click();
  await p.getByText('E-mail ou senha inválidos').waitFor();
  await shot(p, '01-login-invalido', false);
  ok('login com senha errada é recusado');
  erros.length = 0; // o 401 do login inválido é esperado

  // Cenário 2: professora Carla registra disponibilidade (segunda e quarta)
  await login(p, 'carla.mendes@sucelso.tech');
  expect(await p.getByRole('link', { name: 'Cadastros' }).count() === 0, 'professor não vê menu de cadastros');
  await p.getByRole('link', { name: 'Disponibilidade' }).click();
  await p.getByRole('heading', { name: 'Minha disponibilidade' }).waitFor();
  const linhas = await p.locator('tbody tr').allInnerTexts();
  expect(linhas.length === 2 && linhas[0].includes('Segunda') && linhas[1].includes('Quarta'), 'Carla só seg/qua: ' + linhas);
  await shot(p, '02-professor-disponibilidade-seg-qua');
  ok('professora vê disponibilidade apenas de segunda e quarta');
  // tentativa de acessar rota de coordenador pela URL
  await p.goto(URL + '/grade');
  await p.waitForURL(/minha-grade/);
  ok('professor que digita /grade é redirecionado');
  await p.close();

  // Cenário 3/4: coordenadora gera a grade
  p = await novaPagina(browser);
  await login(p, 'coordenacao@sucelso.tech');
  await p.getByRole('heading', { name: 'Painel da coordenação' }).waitFor();
  await shot(p, '03-coordenador-painel-inicial');
  await p.getByRole('link', { name: 'Grade', exact: true }).click();
  await p.getByRole('button', { name: 'Gerar nova proposta' }).click();
  await p.getByText(/Versão 1 gerada/).waitFor();
  await p.locator('.grade-tabela .aula').first().waitFor();
  const msg = await p.locator('.alerta-sucesso').innerText();
  expect(/76 de 78 aulas/.test(msg), 'estatística da geração: ' + msg);
  await p.getByText('Carga não atendida').waitFor();
  const conflitos = await p.locator('.painel-conflitos').innerText();
  expect(conflitos.includes('0 erro') && conflitos.includes('Carla Mendes'), 'painel de conflitos: ' + conflitos);
  await shot(p, '04-coordenador-grade-gerada');
  ok('coordenadora gera a proposta: 76/78 aulas, pendência explicada no painel');

  // Ver por professor (Carla) → só segunda e quarta
  await p.getByRole('radio', { name: 'Professor' }).click();
  await p.getByLabel('Selecionar professor').selectOption({ label: 'Carla Mendes' });
  await p.waitForTimeout(500);
  const diasCarla = await p.locator('.grade-tabela tbody tr').evaluateAll((trs) => {
    const dias = new Set();
    for (const tr of trs) [...tr.querySelectorAll('td')].forEach((td, i) => td.querySelector('.aula') && dias.add(i));
    return [...dias];
  });
  expect(JSON.stringify(diasCarla.sort()) === '[0,2]', 'Carla só seg(0)/qua(2): ' + diasCarla);
  await shot(p, '05-coordenador-grade-por-professor');
  ok('na visão por professor, as aulas da Carla estão só segunda e quarta');

  // Cenário 5: ajusta uma alocação (sala) via modal
  await p.getByRole('radio', { name: 'Turma' }).click();
  await p.waitForTimeout(400);
  await p.locator('.grade-tabela button.aula').first().click();
  await p.getByRole('dialog').waitFor();
  await p.getByLabel('Sala').selectOption({ label: 'Auditório (cap. 80)' });
  await shot(p, '06-coordenador-modal-ajuste', false);
  await p.getByRole('dialog').getByRole('button', { name: 'Salvar', exact: true }).click();
  await p.getByText(/Alocação de .* ajustada/).waitFor();
  await p.locator('.grade-tabela .aula', { hasText: 'Auditório' }).first().waitFor({ timeout: 5000 });
  expect((await p.locator('.grade-tabela .aula', { hasText: 'Auditório' }).first().innerText()).toUpperCase().includes('AJUSTADA'), 'situação ajustada');
  ok('coordenadora ajusta a sala de uma aula (situação "ajustada")');

  // Tentativa de choque: move a aula para o horário de outra da mesma turma
  await p.locator('.grade-tabela button.aula').nth(1).click();
  await p.getByLabel('Dia').selectOption({ label: 'Segunda' });
  await p.getByLabel('Horário').selectOption({ index: 0 });
  await p.getByRole('dialog').getByRole('button', { name: 'Salvar', exact: true }).click();
  await p.getByRole('dialog').locator('.alerta-erro').waitFor();
  const erroChoque = await p.getByRole('dialog').locator('.alerta').innerText();
  expect(/conflito/i.test(erroChoque), 'erro de choque: ' + erroChoque);
  await shot(p, '07-coordenador-edicao-com-choque', false);
  await p.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  ok('edição que causa choque é bloqueada com explicação');
  erros.splice(0, erros.length, ...erros.filter((e) => !e.includes('409'))); // 409 esperado

  // Revisão e publicação
  await p.getByRole('button', { name: 'Enviar para revisão' }).click();
  await p.getByRole('button', { name: 'Publicar' }).click();
  await p.getByText(/Grade publicada!/).waitFor();
  await shot(p, '08-coordenador-publicada');
  ok('fluxo rascunho → em revisão → publicada');
  await p.close();

  // Cenário 6: aluno visualiza sem poder editar
  p = await novaPagina(browser);
  await login(p, 'lucas.pereira@aluno.sucelso.tech');
  await p.getByRole('heading', { name: 'Turma ENG1-A' }).waitFor();
  expect(await p.locator('.grade-tabela .aula').count() === 20, '20 aulas na grade do aluno');
  expect(await p.locator('.grade-tabela button.aula, .aula-vazia').count() === 0, 'aluno sem controles de edição');
  expect((await p.locator('.grade-tabela').innerText()).includes('Intervalo'), 'grade mostra intervalo');
  await shot(p, '09-aluno-minha-turma');
  // notificação de publicação
  await p.getByRole('button', { name: /Notificações/ }).click();
  await p.getByText(/Nova grade oficial publicada/).first().waitFor();
  await shot(p, '10-aluno-notificacao', false);
  ok('aluno vê a grade oficial (com sala, docente, situação) sem controles de edição e recebe notificação');
  // aluno tenta rota de coordenador
  await p.goto(URL + '/cadastros');
  await p.waitForURL(/minha-turma/);
  // aluno tenta chamar a API diretamente com o próprio token
  const status = await p.evaluate(async (api) => {
    const token = localStorage.getItem('sucelso.token');
    const r = await fetch(api + '/api/horarios/1', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ dia: 5 }) });
    return r.status;
  }, API_URL);
  expect(status === 403, 'API recusa aluno: ' + status);
  ok('aluno que chama PUT /api/horarios direto na API recebe 403');
  erros.splice(0, erros.length, ...erros.filter((e) => !e.includes('403'))); // 403 esperado
  await p.close();

  // Celular
  p = await novaPagina(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await login(p, 'lucas.pereira@aluno.sucelso.tech');
  await p.locator('.grade-movel .aula').first().waitFor();
  expect(!(await p.locator('.grade-tabela').isVisible()), 'tabela escondida no celular');
  await p.getByRole('tab', { name: 'Qua' }).click();
  await shot(p, '11-aluno-celular');
  const largura = await p.evaluate(() => document.documentElement.scrollWidth);
  expect(largura <= 390, 'sem rolagem horizontal no celular: ' + largura);
  ok('grade responsiva: abas por dia no celular, sem rolagem horizontal');
  await p.close();

  // Cenário 7: professora registra nova disponibilidade após publicação → solicitação
  p = await novaPagina(browser);
  await login(p, 'carla.mendes@sucelso.tech');
  await p.getByRole('heading', { name: 'Minha grade' }).waitFor();
  const aulasCarla = await p.locator('.grade-tabela .aula').count();
  expect(aulasCarla === 6, 'Carla tem 6 aulas: ' + aulasCarla);
  await shot(p, '12-professor-minha-grade');
  await p.getByRole('link', { name: 'Disponibilidade' }).click();
  await p.getByLabel('Dia').selectOption({ label: 'Terça' });
  await p.getByLabel('Início').fill('13:00');
  await p.getByLabel('Fim').fill('17:20');
  await p.getByRole('button', { name: 'Solicitar inclusão' }).click();
  await p.getByText(/Solicitação enviada à coordenação/).waitFor();
  await shot(p, '13-professor-solicitacao-apos-publicacao');
  ok('após a publicação, nova disponibilidade vira solicitação pendente');
  await p.close();

  p = await novaPagina(browser);
  await login(p, 'coordenacao@sucelso.tech');
  await p.getByRole('link', { name: 'Solicitações' }).click();
  await p.getByText('Carla Mendes').waitFor();
  await shot(p, '14-coordenador-solicitacoes');
  await p.getByRole('button', { name: 'Aprovar' }).click();
  await p.getByText(/aprovada\. A grade publicada não foi alterada/).waitFor();
  ok('coordenadora aprova; a grade publicada não muda');
  await p.getByRole('link', { name: 'Grade', exact: true }).click();
  await p.locator('.grade-tabela .aula').first().waitFor();
  expect(/publicada/i.test(await p.locator('.versao.ativa').innerText()), 'versão publicada continua ativa');
  await p.getByRole('button', { name: 'Duplicar para editar' }).waitFor();
  await p.getByRole('link', { name: 'Painel' }).click();
  await p.locator('.barra').first().waitFor();
  await shot(p, '15-coordenador-painel-ocupacao');
  ok('painel mostra a ocupação das salas');
  await p.getByRole('link', { name: 'Histórico' }).click();
  await p.getByText('publicar').first().waitFor();
  await shot(p, '16-coordenador-historico');
  await p.getByRole('link', { name: 'Cadastros' }).click();
  await p.getByRole('tab', { name: 'Vínculos' }).click();
  await p.locator('table td', { hasText: 'Redes de Computadores' }).first().waitFor();
  await shot(p, '17-coordenador-cadastros-vinculos');
  ok('histórico e cadastros acessíveis à coordenação');
  await p.close();

  await browser.close();
  if (erros.length) {
    console.log('\nErros capturados no navegador:\n' + erros.join('\n'));
    process.exit(1);
  }
  console.log('\nNenhum erro de console/página/HTTP 5xx.');
})().catch((e) => {
  console.error(e.message);
  if (erros.length) console.log(erros.join('\n'));
  process.exit(1);
});
