import { useCookies } from "react-cookie";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { setData } from "./redux/data";
import api from "./utils/api";

export const Logout: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [, setCookie] = useCookies(["userinfo"]);
  api
    .post("/logout")
    .then((res) => {
      console.log(res.data);
      setCookie("userinfo", "{}", { path: "/" });
      dispatch(setData({}));
      navigate("/login");
    })
    .catch((e) => {
      console.log(e);
      alert(e.response.data);
    });

  return <></>;
};
