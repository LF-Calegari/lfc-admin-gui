import { Search } from 'lucide-react';
import React, { useState } from 'react';
import styled from 'styled-components';

import {
  Checkbox,
  Icon,
  Input,
  Label,
  RadioGroup,
  Select,
  Switch,
  Textarea,
} from '../../components/ui';

import { ShowcaseSection, Stack } from './_shared';

/**
 * Issue #37 — Inputs.
 *
 * Cobre Input, Textarea, Select, Checkbox, Radio (via RadioGroup) e Switch.
 * Demonstra estados (default/focus/disabled/error/helper) e tamanhos sm/md/lg.
 *
 * Acessibilidade: cada controle expõe `aria-invalid` quando há erro, helper
 * vinculado por `aria-describedby` e `:focus-visible` consistente com
 * `--focus-ring-accent`.
 */

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-4);
`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  align-items: flex-start;
`;

export const Inputs: React.FC = () => {
  const [text, setText] = useState('admin@lfc.com.br');
  const [password, setPassword] = useState('senha-revelavel');
  const [secret, setSecret] = useState('senha-cega');
  const [bio, setBio] = useState('');
  const [system, setSystem] = useState('auth');
  const [agree, setAgree] = useState(false);
  const [agreeError, setAgreeError] = useState(false);
  const [scope, setScope] = useState('read');
  const [notif, setNotif] = useState(true);

  return (
    <ShowcaseSection
      eyebrow="Components"
      title="Inputs"
      description="Família de campos de formulário. Tamanhos sm/md/lg quando aplicável; estados default, focus, disabled, com helper e com error."
      ariaLabel="Components Inputs"
    >
      <Stack>
        <Label>Input · texto</Label>
        <Grid>
          <Input
            label="E-mail"
            value={text}
            onChange={setText}
            placeholder="email@empresa.com"
          />
          <Input
            label="Buscar"
            placeholder="Sistema, role ou usuário"
            icon={<Icon icon={Search} size="sm" />}
          />
          <Input label="Disabled" value="—" disabled />
          <Input
            label="Senha (erro)"
            type="password"
            value="senha123"
            error="Senha incorreta"
            onChange={() => undefined}
          />
        </Grid>
      </Stack>

      <Stack>
        <Label>Input · senha (toggle de visibilidade)</Label>
        <Grid>
          <Input
            label="Senha (com toggle)"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="Sua senha"
            autoComplete="new-password"
          />
          <Input
            label="Senha (sem toggle, opt-out)"
            type="password"
            value={secret}
            onChange={setSecret}
            placeholder="Sua senha"
            autoComplete="new-password"
            revealable={false}
          />
        </Grid>
      </Stack>

      <Stack>
        <Label>Textarea · estados e tamanhos</Label>
        <Grid>
          <Textarea
            label="Bio"
            value={bio}
            onChange={setBio}
            helperText="Máximo 200 caracteres"
            placeholder="Descreva o usuário"
          />
          <Textarea label="Notas (sm)" size="sm" placeholder="Observações curtas" />
          <Textarea
            label="Falha de validação"
            error="Campo obrigatório"
            placeholder="Texto"
          />
          <Textarea label="Disabled" disabled value="Read-only" />
        </Grid>
      </Stack>

      <Stack>
        <Label>Select · nativo com tamanhos</Label>
        <Grid>
          <Select
            label="Sistema"
            value={system}
            onChange={setSystem}
            helperText="Escolha o sistema operado"
          >
            <option value="auth">lfc-authenticator</option>
            <option value="kurtto">lfc-kurtto</option>
            <option value="legacy">legacy</option>
          </Select>
          <Select label="Tamanho sm" size="sm" defaultValue="">
            <option value="">--</option>
            <option value="a">A</option>
          </Select>
          <Select label="Disabled" disabled defaultValue="">
            <option value="">—</option>
          </Select>
          <Select label="Erro" error="Selecione ao menos um item" defaultValue="">
            <option value="">--</option>
            <option value="b">B</option>
          </Select>
        </Grid>
      </Stack>

      <Stack>
        <Label>Checkbox</Label>
        <Row>
          <Checkbox
            label="Lembrar minha sessão"
            checked={agree}
            onChange={v => {
              setAgree(v);
              setAgreeError(false);
            }}
            helperText="Mantém a sessão aberta por 30 dias."
          />
          <Checkbox label="Disabled (off)" disabled />
          <Checkbox label="Disabled (checked)" disabled defaultChecked />
          <Checkbox
            label="Aceito os termos"
            error={agreeError ? 'Necessário aceitar' : undefined}
            onChange={v => setAgreeError(!v)}
          />
        </Row>
      </Stack>

      <Stack>
        <Label>Radio · grupo</Label>
        <Row>
          <RadioGroup
            name="scope"
            legend="Escopo padrão da chave"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'read', label: 'Leitura' },
              { value: 'write', label: 'Escrita' },
              { value: 'admin', label: 'Admin', helperText: 'Acesso completo' },
              { value: 'legacy', label: 'Legado', disabled: true },
            ]}
          />
        </Row>
      </Stack>

      <Stack>
        <Label>Switch</Label>
        <Row>
          <Switch
            label="Notificações"
            checked={notif}
            onChange={setNotif}
            helperText="Email + push quando algo mudar"
          />
          <Switch label="Modo escuro" />
          <Switch label="Disabled (off)" disabled />
          <Switch label="Disabled (on)" disabled defaultChecked />
        </Row>
      </Stack>
    </ShowcaseSection>
  );
};
