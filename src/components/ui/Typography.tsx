import React from 'react';
import styled, { css } from 'styled-components';

type HeadingLevel = 1 | 2 | 3 | 4;
type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4' | 'div' | 'span' | 'p';
type TextTag = 'p' | 'span' | 'div';

interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level?: HeadingLevel;
  as?: HeadingTag;
  children: React.ReactNode;
}

interface TextProps extends React.HTMLAttributes<HTMLParagraphElement> {
  as?: TextTag;
  muted?: boolean;
  children: React.ReactNode;
}

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode;
}

/* ─── Heading ─────────────────────────────────────────────── */

const headingStyles: Record<HeadingLevel, ReturnType<typeof css>> = {
  1: css`
    font-size: var(--text-3xl);
    font-weight: var(--weight-bold);
    letter-spacing: var(--tracking-tight);
    line-height: var(--leading-tight);
  `,
  2: css`
    font-size: var(--text-2xl);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-tight);
    line-height: var(--leading-tight);
  `,
  3: css`
    font-size: var(--text-xl);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-tight);
    line-height: var(--leading-tight);
  `,
  4: css`
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    line-height: var(--leading-snug);
  `,
};

const StyledHeading = styled.h1<{ $level: HeadingLevel }>`
  font-family: var(--font-display);
  color: var(--text-primary);
  margin: 0;

  ${({ $level }) => headingStyles[$level]}
`;

export const Heading: React.FC<HeadingProps> = ({
  level = 1,
  as,
  children,
  ...props
}) => {
  const Tag: HeadingTag = as ?? (`h${level}` as HeadingTag);
  return (
    <StyledHeading as={Tag} $level={level} {...props}>
      {children}
    </StyledHeading>
  );
};

/* ─── Body ────────────────────────────────────────────────── */

const StyledBody = styled.p<{ $muted: boolean }>`
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: var(--weight-regular);
  line-height: var(--leading-base);
  color: ${({ $muted }) => ($muted ? 'var(--text-muted)' : 'var(--text-primary)')};
`;

export const Body: React.FC<TextProps> = ({ as, muted = false, children, ...props }) => (
  <StyledBody as={as} $muted={muted} {...props}>
    {children}
  </StyledBody>
);

/* ─── Caption ─────────────────────────────────────────────── */

const StyledCaption = styled.span<{ $muted: boolean }>`
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: var(--weight-regular);
  line-height: var(--leading-snug);
  color: ${({ $muted }) => ($muted ? 'var(--text-muted)' : 'var(--text-secondary)')};
`;

export const Caption: React.FC<TextProps> = ({ as, muted = true, children, ...props }) => (
  <StyledCaption as={as} $muted={muted} {...props}>
    {children}
  </StyledCaption>
);

/* ─── Label ───────────────────────────────────────────────── */

const StyledLabel = styled.label`
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  line-height: var(--leading-snug);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--text-secondary);
`;

export const Label: React.FC<LabelProps> = ({ children, ...props }) => (
  <StyledLabel {...props}>{children}</StyledLabel>
);

/* ─── Aggregate export ────────────────────────────────────── */

export const Typography = {
  Heading,
  Body,
  Caption,
  Label,
};

export type { HeadingLevel, HeadingProps, TextProps, LabelProps };
