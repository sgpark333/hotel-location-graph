# Quadrant Graph App

Vite + React + Recharts 기반의 4사분면 그래프 앱입니다.

## 주요 기능

- 점 추가 / 삭제
- 점별 색상 변경
- 엑셀 업로드
- PNG 다운로드
- 2차 사분면 보조선 표시
- 점 간 화살표 연결
- 호텔명 라벨 이동

## 로컬 실행

```powershell
npm install
npm run dev
```

## 빌드

```powershell
npm run build
```

## Vercel 배포

이 프로젝트는 Vercel에 바로 배포할 수 있게 설정되어 있습니다.

### 방법 1. Vercel 웹에서 배포

1. 프로젝트 폴더를 GitHub 저장소에 업로드
2. [https://vercel.com/new](https://vercel.com/new) 접속
3. GitHub 저장소 연결
4. Framework Preset이 `Vite`로 잡혔는지 확인
5. Deploy 클릭

### 방법 2. 정적 파일 업로드

1. 아래 명령 실행

```powershell
npm run build
```

2. 생성된 `dist` 폴더를 정적 호스팅 서비스에 업로드

## 배포 설정

- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`
