import { Announcement } from './types';

export const INITIAL_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'silencio',
    title: 'Silêncio',
    audioUrl: 'silencio.mp3',
    category: 'success',
    description: 'Solicitação de silêncio para as dependências médicas.',
    duration: 3
  },
  {
    id: 'campainha',
    title: 'Campainha',
    audioUrl: 'campainha.mp3',
    category: 'success',
    description: 'Sons de chamada padrão para notificações internas.',
    duration: 4
  },
  {
    id: 'bemvindo',
    title: 'Bem-vindo ao HMMB',
    audioUrl: 'bemvindo.mp3',
    category: 'success',
    description: 'Mensagem institucional de boas-vindas do hospital.',
    duration: 5
  },
  {
    id: 'bdia',
    title: 'Bom dia!',
    audioUrl: 'bdia.mp3',
    category: 'success',
    description: 'Saudação de bom dia aos colaboradores e pacientes.',
    duration: 3
  },
  {
    id: 'mensagem',
    title: 'Mensagem de Bom dia!',
    audioUrl: 'mensagem.mp3',
    category: 'success',
    description: 'Agradecimento e palavras cordiais para o início do dia.',
    duration: 10
  },
  {
    id: 'mascara',
    title: 'Uso de máscara obrigatório',
    audioUrl: 'mascara.mp3',
    category: 'warning',
    description: 'Aviso sobre a obrigatoriedade permanente do uso de máscaras.',
    duration: 6
  },
  {
    id: 'atencao',
    title: 'Retirar carro',
    audioUrl: 'atencao.mp3',
    category: 'warning',
    description: 'Solicitação genérica para remoção imediata de veículo estacionado.',
    duration: 5
  },
  {
    id: 'traga',
    title: 'Ao vir ao hospital traga sua máscara',
    audioUrl: 'traga.mp3',
    category: 'danger',
    description: 'Alerta preventivo para pacientes trazem suas próprias máscaras.',
    duration: 7
  },
  {
    id: 'corredor',
    title: 'Pedimos que não fiquem no corredor',
    audioUrl: 'corredor.mp3',
    category: 'warning',
    description: 'Instrução para acompanhantes liberarem as vias de circulação.',
    duration: 6
  },
  {
    id: 'veiculo',
    title: 'Remover veiculo parado na Emergencia',
    audioUrl: 'veiculo.mp3',
    category: 'warning',
    description: 'Alerta urgente para desobstrução da vaga de ambulâncias e emergência.',
    duration: 7
  },
  {
    id: 'enfermeira_triagem',
    title: 'Enfermeira comparecer à sala de triagem',
    audioUrl: 'enfermeira_triagem.mp3',
    category: 'danger',
    description: 'Chamada urgente para profissionais de enfermagem na triagem clínica.',
    duration: 6
  },
  {
    id: 'medico',
    title: 'Médico comparecer ao consultório do PS',
    audioUrl: 'medico.mp3',
    category: 'danger',
    description: 'Chamada urgente para médico de plantão no Pronto Socorro.',
    duration: 6
  },
  {
    id: 'medicacao',
    title: 'Pacientes que aguardam a medicação',
    audioUrl: 'medicacao.mp3',
    category: 'danger',
    description: 'Chamado geral para pacientes comparecerem à sala de medicação.',
    duration: 6
  },
  {
    id: 'acompanhante',
    title: 'Acompanhantes da sala de medicação',
    audioUrl: 'acompanhante.mp3',
    category: 'danger',
    description: 'Instruções específicas para acompanhantes na sala de tratamento.',
    duration: 6
  },
  {
    id: 'prevenir',
    title: 'Como se prevenir do novo Coronavírus (COVID-19)',
    audioUrl: 'prevenir.mp3',
    category: 'success',
    description: 'Orientações educativas de higiene básica para prevenção sanitária.',
    duration: 15
  },
  {
    id: 'samu',
    title: 'Chegada da ambulância do samu',
    audioUrl: 'samu.mp3',
    category: 'danger',
    description: 'Alerta de recepção de paciente emergencial trazido pelo SAMU.',
    duration: 6
  }
];
