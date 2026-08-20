---
name: Tempo reduzido do dia
description: Gestor pode salvar tempos reduzidos para uma data específica; sobrescreve o quadro padrão só nesse dia em TV e Assistente
type: feature
---
Tabela `schedule_reduced_days` (school_id, reduced_date, shift, period_number, label, start_time, end_time).
- `/gestor/horarios` tem toggle "Quadro padrão" vs "Tempo reduzido do dia" + datepicker. Salvar grava apenas para o turno editado.
- UI usa botõezinhos +/- de 5min ao lado do `<input type="time">` para facilitar edição mobile.
- TV (`TvProfessores`) e Assistente (`AssistenteQuadro`) mesclam overrides por (shift, period_number) ao carregar `schedule_periods`.
