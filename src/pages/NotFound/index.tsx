import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";

const NotFoundContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 60vh;
  padding: ${({ theme }) => theme.spacing.large};
`;

const NotFoundCard = styled(Card)`
  text-align: center;
  max-width: 500px;
  padding: ${({ theme }) => theme.spacing.xlarge};
`;

const NotFoundTitle = styled.h1`
  font-size: ${({ theme }) => theme.fontSizes.xlarge};
  color: ${({ theme }) => theme.colors.dark};
  margin-bottom: ${({ theme }) => theme.spacing.medium};
  font-weight: 600;
`;

const NotFoundSubtitle = styled.h2`
  font-size: ${({ theme }) => theme.fontSizes.large};
  color: ${({ theme }) => theme.colors.secondary};
  margin-bottom: ${({ theme }) => theme.spacing.medium};
  font-weight: 400;
`;

const NotFoundMessage = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.medium};
  color: ${({ theme }) => theme.colors.secondary};
  margin-bottom: ${({ theme }) => theme.spacing.large};
  line-height: 1.6;
`;

const ButtonContainer = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.medium};
  justify-content: center;
  flex-wrap: wrap;
`;

function NotFound(): JSX.Element {
  const navigate = useNavigate();

  const handleGoHome = () => {
    navigate("/");
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  return (
    <NotFoundContainer data-test-id="not-found-container">
      <NotFoundCard>
        <NotFoundTitle>404</NotFoundTitle>
        <NotFoundSubtitle>Page Not Found</NotFoundSubtitle>
        <NotFoundMessage>
          Sorry, the page you are looking for doesn't exist or has been moved.
          You can go back to the previous page or return to the home page.
        </NotFoundMessage>
        <ButtonContainer>
          <Button onClick={handleGoBack} data-test-id="go-back-button">
            Go Back
          </Button>
          <Button onClick={handleGoHome} data-test-id="go-home-button">
            Go Home
          </Button>
        </ButtonContainer>
      </NotFoundCard>
    </NotFoundContainer>
  );
}

export default NotFound; 